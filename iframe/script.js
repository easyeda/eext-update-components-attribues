const assert = (cond, msg = 'Assertion failed') => {
	if (!cond) throw new Error(msg);
};

document.addEventListener('DOMContentLoaded', async () => {
	const select = document.getElementById('select3'); // 库归属
	const schselect = document.getElementById('select1'); // 原理图
	const select2 = document.getElementById('select2'); // 搜索依据（动态追加）

	try {
		// ================================
		// 1. 填充原理图下拉框（支持多个原理图）
		// ================================
		const projectInfo = await eda.dmt_Project.getCurrentProjectInfo();
		console.log(projectInfo);
		const data = Array.isArray(projectInfo?.data) ? projectInfo.data : [];

		let schOptionsHTML = '<option value="" disabled selected>请选择原理图</option>';
		let hasSchematic = false;

		for (const item of data) {
			if (item?.schematic?.name) {
				const schName = item.schematic.name;
				schOptionsHTML += `<option value="${schName}">${schName}</option>`;
				hasSchematic = true;
			}
		}

		if (!hasSchematic) {
			schOptionsHTML = '<option value="" disabled selected>无可用原理图</option>';
		}
		schselect.innerHTML = schOptionsHTML;

		// ================================
		// 2. 填充库归属下拉框
		// ================================
		const libs = await eda.lib_LibrariesList.getAllLibrariesList();

		// 获取特殊库 UUID（注意顺序！）
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
		].filter((lib) => lib.uuid && lib.name); // 过滤无效项

		select.innerHTML =
			'<option value="" disabled selected>请选择库归属</option>' +
			allOptions.map((lib) => `<option value="${lib.uuid}">${lib.name}</option>`).join('');

		// ================================
		// 3. 动态追加 OtherProperty 字段到 select2
		// ================================
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
            <option value="Device">器件名 (Device)</option>
            <option value="PartNumber">料号 (Part Number)</option>
            <option value="Symber">符号名 (Name)</option>
            <option value="ManufacturerPart">制造商编号(ManufacturerPart)</option>
            <option value="PartCode">编号 (Designator)</option>
        `;
		const dynamicOptionsHTML = Array.from(otherPropKeys)
			.sort()
			.map((key) => `<option value="${key}">${key}</option>`)
			.join('');

		select2.innerHTML = staticOptions + dynamicOptionsHTML;

		// ================================
		// 4. 绑定按钮事件
		// ================================
		document.getElementById('startbutton').addEventListener('click', async () => {
			const searchField = document.getElementById('select2').value; // 搜索依据
			const outputField = document.getElementById('select4').value; // 输出/写回字段
			const libUuid = select.value;

			assert(libUuid, '请选择库归属');
			assert(searchField, '请选择搜索字段');
			assert(outputField, '请选择输出字段');

			const devices = await eda.sch_PrimitiveComponent.getAll('part', true);

			// 搜索字段映射：如何从器件获取关键词
			const searchGetterMap = {
				Device: (d) => d.getState_ManufacturerId(),
				PartNumber: (d) => d.getState_SupplierId(),
				Symber: (d) => d.getState_Name(),
				ManufacturerPart: (d) => d.getState_ManufacturerId(),
				value: (d) => d.getState_Name(), // 注意：这里可能应为 getState_Value()？根据实际 API 调整
				PartCode: (d) => d.getState_Designator(),
			};

			// 输出动作：如何将搜索结果写回器件
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
				Symber: (r, d) => {
					console.log('ℹ️ 关联符号名:', r.symbolName);
					// 如果需要设置符号，需调用其他 API，此处仅日志
				},
				ManufacturerPart: (r, d) => {
					const manuId = r.manufacturerId;
					if (manuId != null && manuId !== '') {
						console.log('📌 写入制造商编号:', manuId);
						d.setState_ManufacturerId(manuId);
						d.done();
					}
				},
				value: (r, d) => {
					const DeviceValue = r.value;
					if (DeviceValue != null && DeviceValue !== '') {
						console.log('📌 写入属性 value:', DeviceValue);
						d.setState_OtherProperty({ value: DeviceValue });
						d.done(); // 注意：某些 API 可能要求 done()
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

		// 关闭按钮
		document.getElementById('closebutton').addEventListener('click', () => {
			eda.sys_IFrame.closeIFrame();
		});
	} catch (error) {
		console.error('❌ 初始化失败:', error);
		alert('初始化失败：' + error.message);
	}
});
