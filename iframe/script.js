document.addEventListener('DOMContentLoaded', async () => {
	const select = document.getElementById('select3'); // 库归属
	const schselect = document.getElementById('select1'); // 原理图
	const select2 = document.getElementById('select2'); // 搜索依据（将追加动态字段）

	// 获取当前工程信息，填充原理图下拉
	const projectInfo = await eda.dmt_Project.getCurrentProjectInfo();
	const data = projectInfo.data;
	let optionsHTML = '<option value="" disabled selected>请选择原理图</option>';
	data.forEach(item => {
		const schName = item.schematic.name;
		optionsHTML += `<option value="${schName}">${schName}</option>`;
	});
	schselect.innerHTML = optionsHTML;

	// 获取所有库列表及特殊库 UUID
	const libs = await eda.lib_LibrariesList.getAllLibrariesList();
	const [sysUuid, personalUuid, projectUuid, favoriteUuid] = await Promise.all([
		eda.lib_LibrariesList.getPersonalLibraryUuid(),
		eda.lib_LibrariesList.getProjectLibraryUuid(),
		eda.lib_LibrariesList.getFavoriteLibraryUuid()
	]);

	const allOptions = [
		{ uuid: personalUuid, name: '个人' },
		{ uuid: projectUuid, name: '工程' },
		{ uuid: favoriteUuid, name: '收藏' },
		...libs
	];

	select.innerHTML = '<option value="" disabled selected>请选择库归属</option>' +
		allOptions.map(lib => `<option value="${lib.uuid}">${lib.name}</option>`).join('');

	// ================================
	// 新增：动态追加 OtherProperty 的字段到 select2
	// ================================
	const allDevices = await eda.sch_PrimitiveComponent.getAll('part', true);
	const otherPropKeys = new Set();

	for (const device of allDevices) {
		const props = device.getState_OtherProperty();
		if (props && typeof props === 'object' && !Array.isArray(props)) {
			Object.keys(props).forEach(key => {
				if (key && typeof key === 'string') {
					otherPropKeys.add(key);
				}
			});
		}
	}

	// 生成动态选项并追加（不覆盖已有选项）
	const dynamicOptionsHTML = Array.from(otherPropKeys)
		.map(key => `<option value="${key}">${key}</option>`)
		.join('');

	if (dynamicOptionsHTML) {
		select2.insertAdjacentHTML('beforeend', dynamicOptionsHTML);
	}

	// ================================
	// 按钮事件绑定
	// ================================
	document.getElementById('startbutton').addEventListener('click', async () => {
		const searchField = document.getElementById('select2').value; // 搜索依据
		const outputField = document.getElementById('select4').value; // 输出/写回依据
		const libUuid = select.value;
		assert(libUuid, '请选择库归属');
		assert(searchField, '请选择搜索字段');
		assert(outputField, '请选择输出字段');

		const devices = await eda.sch_PrimitiveComponent.getAll('part', true);

		const searchGetterMap = {
			Device: d => d.getState_ManufacturerId(),
			PartNumber: d => d.getState_SupplierId(),
			Symber: d => d.getState_Name(),
			ManufacturerPart: d => d.getState_ManufacturerId(),
			value: d => d.getState_Name(),
			PartCode: d => d.getState_Designator()
		};

		const outputActions = {
			Device: (r, d) => {
				const DeviceName = r.name;
				console.log('器件名：', DeviceName);
				d.setState_ManufacturerId(DeviceName);
				d.done();
			},
			PartNumber: (r, d) => {
				const SupId = r.supplierId;
				console.log('料号：', SupId);
				d.setState_SupplierId(SupId);
				d.done();
			},
			Symber: (r, d) => {
				console.log('关联符号：', r.symbolName);
			},
			ManufacturerPart: (r, d) => {
				const manuId = r.manufacturerId;
				console.log('制造商编号：', manuId);
				if (manuId != null && manuId !== '') {
					d.setState_ManufacturerId(manuId);
					d.done();
					console.log('✅ 已设置 ManufacturerId:', manuId);
				}
			},
			value: (r, d) => {
				const DeviceValue = r.value;
				if (DeviceValue != undefined && DeviceValue != '') {
					d.setState_OtherProPerty({ value: DeviceValue });
				}
				console.log('值：', DeviceValue);
			},
			PartCode: (r, d) => {
				const PartCode = r.ordinal;
				if (PartCode != undefined && PartCode != '') {
					d.setState_OtherProPerty({ PartCode: PartCode });
				}
				console.log('编号：', PartCode);
			}
		};

		assert(searchGetterMap[searchField], '未知的搜索字段');
		assert(outputActions[outputField], '未知的输出字段');

		for (const d of devices) {
			const keyword = searchGetterMap[searchField](d);
			if (!keyword) continue;
			console.log('🔍 搜索关键词（基于', searchField, '）:', keyword);

			const results = await eda.lib_Device.search(keyword, libUuid, null, null, 10000, 1);
			if (results.length === 0) continue;

			outputActions[outputField](results[0], d);
		}
	});

	document.getElementById('closebutton').addEventListener('click', () => {
		eda.sys_IFrame.closeIFrame();
	});
});

const assert = (cond, msg = 'Assertion failed') => {
	if (!cond) throw new Error(msg);
};
