const assert = (cond, msg = 'Assertion failed') => {
	if (!cond) throw new Error(msg);
};

document.addEventListener('DOMContentLoaded', async () => {
	const select = document.getElementById('select3');
	const schselect = document.getElementById('select1');
	const select2 = document.getElementById('select2');

	try {
		const projectInfo = await eda.dmt_Project.getCurrentProjectInfo();
		const data = Array.isArray(projectInfo?.data) ? projectInfo.data : [];

		let schName = '';
		for (const item of data) {
			if (item?.schematic?.name) {
				schName = item.schematic.name;
				break;
			}
		}

		schselect.innerHTML = schName ? `<option value="${schName}" selected>${schName}</option>` : '<option value="" disabled>无可用原理图</option>';
		schselect.disabled = true;

		const libs = await eda.lib_LibrariesList.getAllLibrariesList();

		const [personalUuid, projectUuid, favoriteUuid] = await Promise.all([
			eda.lib_LibrariesList.getPersonalLibraryUuid(),
			eda.lib_LibrariesList.getProjectLibraryUuid(),
			eda.lib_LibrariesList.getFavoriteLibraryUuid(),
		]);

		const allOptions = [
			{ uuid: personalUuid, name: '个人' },
			{ uuid: projectUuid, name: '工程' },
			{ uuid: favoriteUuid, name: '收藏' },
			...libs,
		].filter((lib) => lib.uuid && lib.name);

		select.innerHTML =
			'<option value="" disabled selected>请选择库归属</option>' +
			allOptions.map((lib) => `<option value="${lib.uuid}">${lib.name}</option>`).join('');

		const allDevices = await eda.sch_PrimitiveComponent.getAll('part', true);
		const otherPropKeys = new Set();

		for (const device of allDevices) {
			const props = device.getState_OtherProperty();
			if (props && typeof props === 'object' && !Array.isArray(props)) {
				Object.keys(props).forEach((key) => {
					if (key && typeof key === 'string') {
						otherPropKeys.add(key.trim());
					}
				});
			}
		}

		const staticOptions = `
            <option value="" disabled selected>请选择搜索字段</option>
            <option value="Device">器件名(Device)</option>
            <option value="PartNumber">料号(Part Number)</option>
            <option value="ManufacturerPart">制造商编号(Manufacturer Part)</option>
            <option value="SupplierPart">制造商编号(Supplier Part)</option>
            <option value="Value">值(Value)</option>
            <option value="PartCode">物料编码(Part Code)</option>
        `;
		const dynamicOptionsHTML = Array.from(otherPropKeys)
			.sort()
			.map((key) => `<option value="${key}">${key}</option>`)
			.join('');

		select2.innerHTML = staticOptions + dynamicOptionsHTML;

		document.getElementById('startbutton').addEventListener('click', async () => {
			const searchField = document.getElementById('select2').value;
			const outputField = document.getElementById('select4').value;
			const libUuid = select.value;

			assert(libUuid, '请选择库归属');
			assert(searchField, '请选择搜索字段');
			assert(outputField, '请选择输出字段');

			const devices = await eda.sch_PrimitiveComponent.getAll('part', true);

			const searchGetterMap = {
				Device: (d) => d.getState_Name(),
				PartNumber: (d) => d.getState_OtherProperty('Part Number'),
				ManufacturerPart: (d) => d.getState_ManufacturerId(),
				SupplierPart: (d) => d.getState_SupplierId(),
				Value: (d) => d.getState_OtherProperty('Value'),
				PartCode: (d) => d.getState_OtherProperty('Part Code'),
			};

			const outputActions = {
				Device: (r, d) => {
					const DeviceName = r.name;
					console.log('📌 写入器件名:', DeviceName);
					d.setState_ManufacturerId(DeviceName);
					d.done();
				},
				PartNumber: (r, d) => {
					const SupId = r.supplierId;
					console.log('📌 写入料号:', SupId);
					d.setState_SupplierId(SupId);
					d.done();
				},
				ManufacturerPart: (r, d) => {
					const manuId = r.manufacturerId;
					if (manuId != null && manuId !== '') {
						console.log('📌 写入制造商编号:', manuId);
						d.setState_ManufacturerId(manuId);
						d.done();
					}
				},
				Value: (r, d) => {
					const DeviceValue = r.value;
					if (DeviceValue != null && DeviceValue !== '') {
						console.log('📌 写入属性 value:', DeviceValue);
						d.setState_OtherProperty({ value: DeviceValue });
						d.done();
					}
				},
				PartCode: (r, d) => {
					const PartCode = r.ordinal;
					if (PartCode != null && PartCode !== '') {
						console.log('📌 写入属性 PartCode:', PartCode);
						d.setState_OtherProperty({ PartCode: PartCode });
						d.done();
					}
				},
			};

			assert(searchGetterMap[searchField], `未知的搜索字段: ${searchField}`);
			assert(outputActions[outputField], `未知的输出字段: ${outputField}`);

			let processedCount = 0;
			for (const d of devices) {
				const keyword = searchGetterMap[searchField](d);
				if (!keyword || keyword.trim() === '') continue;

				console.log(`🔍 搜索关键词（${searchField}）: "${keyword}"`);

				const results = await eda.lib_Device.search(keyword, libUuid, null, null, 10000, 1);
				if (results.length === 0) {
					console.warn(`⚠️ 未找到匹配项: "${keyword}"`);
					continue;
				}

				outputActions[outputField](results[0], d);
				processedCount++;
			}

			console.log(`✅ 处理完成，共更新 ${processedCount} 个器件`);
			alert(`操作完成！共更新 ${processedCount} 个器件。`);
		});

		document.getElementById('closebutton').addEventListener('click', () => {
			eda.sys_IFrame.closeIFrame();
		});
	} catch (error) {
		console.error('❌ 初始化失败:', error);
		alert('初始化失败：' + error.message);
	}
});
