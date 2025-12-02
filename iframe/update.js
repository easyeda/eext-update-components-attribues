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
		const [sysUuid, personalUuid, projectUuid, favoriteUuid] = await Promise.all([
			eda.lib_LibrariesList.getSystemLibraryUuid(),
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

		const dynamicOpts = Array.from(otherPropKeys)
			.sort()
			.map((k) => `<option value="${k}">${k}</option>`)
			.join('');

		if (dynamicOpts) {
			select2.insertAdjacentHTML('beforeend', dynamicOpts);
		}

		// —————— 绑定开始按钮 ——————
		document.getElementById('startbutton').addEventListener('click', async () => {
			const searchField = select2.value;
			const libUuid = select.value;

			assert(libUuid, '请选择库归属');
			assert(searchField, '请选择搜索字段');

			const devices = await eda.sch_PrimitiveComponent.getAll('part', true);

			const searchGetterMap = {
				Device: (d) => d.getState_Name(),
				PartNumber: (d) => d.getState_OtherProperty('PartNumber'),
				ManufacturerPart: (d) => d.getState_ManufacturerId(),
				SupplierPart: (d) => d.getState_SupplierId(),
				Value: (d) => d.getState_OtherProperty('Value'),
				PartCode: (d) => d.getState_OtherProperty('Part Code'),
			};

			const getSearchValue = (d, field) => {
				if (searchGetterMap[field]) return searchGetterMap[field](d);
				const props = d.getState_OtherProperty();
				if (props && props.hasOwnProperty(field)) {
					const v = props[field];
					if ((typeof v === 'string' || typeof v === 'number') && v !== '') {
						return String(v);
					}
				}
				return null;
			};

			for (const d of devices) {
				const keyword = getSearchValue(d, searchField);
				if (!keyword) continue;

				const results = await eda.lib_Device.search(keyword, libUuid, null, null, 10000, 1);
				if (results.length === 0) continue;

				const dev = results[0];
				const uuid = d.getState_PrimitiveId();
				let delete_result = await eda.sch_PrimitiveComponent.delete(uuid);
				if (delete_result) {
					await eda.sch_PrimitiveComponent.create(
						d.getState_Component(),
						d.getState_X(),
						d.getState_Y(),
						d.getState_SubPartName(),
						d.getState_Rotation(),
						d.getState_Mirror(),
						d.getState_AddIntoBom(),
						d.getState_AddIntoPcb(),
						d.getState_Designator(),
					);
				} else {
					console.log('异常', delete_result);
				}
			}
		});

		document.getElementById('closebutton').addEventListener('click', () => {
			eda.sys_IFrame.closeIFrame();
		});
	} catch (error) {
		console.error('❌ 初始化失败:', error);
		alert('初始化失败：' + error.message);
	}
});
