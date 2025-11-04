document.addEventListener('DOMContentLoaded', async () => {
	const select = document.getElementById('select3'); // 库归属
	const schselect = document.getElementById('select1'); // 原理图

	const projectInfo = await eda.dmt_Project.getCurrentProjectInfo();
	const data = projectInfo.data;
	let optionsHTML = '<option value="" disabled selected>请选择原理图</option>';
	data.forEach(item => {
		const schName = item.schematic.name;
		optionsHTML += `<option value="${schName}">${schName}</option>`;
	});
	schselect.innerHTML = optionsHTML;

	const libs = await eda.lib_LibrariesList.getAllLibrariesList();
	const [sysUuid, personalUuid, projectUuid, favoriteUuid] = await Promise.all([
		eda.lib_LibrariesList.getSystemLibraryUuid(),
		eda.lib_LibrariesList.getPersonalLibraryUuid(),
		eda.lib_LibrariesList.getProjectLibraryUuid(),
		eda.lib_LibrariesList.getFavoriteLibraryUuid()
	]);

	const allOptions = [
		{ uuid: sysUuid, name: '系统' },
		{ uuid: personalUuid, name: '个人' },
		{ uuid: projectUuid, name: '工程' },
		{ uuid: favoriteUuid, name: '收藏' },
		...libs
	];

	select.innerHTML = '<option value="" disabled selected>请选择库归属</option>' +
		allOptions.map(lib => `<option value="${lib.uuid}">${lib.name}</option>`).join('');

	document.getElementById('startbutton').addEventListener('click', async () => {
		const searchField = document.getElementById('select2').value; // 搜索依据
		const libUuid = select.value;
		assert(libUuid, '请选择库归属');
		assert(searchField, '请选择搜索字段');

		const devices = await eda.sch_PrimitiveComponent.getAll('part', true);

		const searchGetterMap = {
			Device: d => d.getState_ManufacturerId(),
			PartNumber: d => d.getState_SupplierId(),
			Symber: d => d.getState_Name(),
			ManufacturerPart: d => d.getState_ManufacturerId(),
			value: d => d.getState_Name(),
			PartCode: d => d.getState_Designator()
		};

		assert(searchGetterMap[searchField], '未知的搜索字段');

		for (const d of devices) {
			const keyword = searchGetterMap[searchField](d);
			if (!keyword) continue;
			console.log('🔍 搜索关键词（基于', searchField, '）:', keyword);
			const results = await eda.lib_Device.search(keyword, libUuid, null, null, 10000, 1);
			if (results.length === 0) {
				console.log(keyword, '⚠️ 未找到匹配的器件');
				continue;
			}
			// 直接输出搜索到的第一个器件的所有属性
			const uuid = d.getState_PrimitiveId(); //获取当前器件对象的uuid
			const DeviceX = d.getState_X();
			const DeviceY = d.getState_Y();
			const SubName = d.getState_SubPartName();
			const rotation = d.getState_Rotation();
			const mirror = d.getState_Mirror();
			const AddToBom = d.getState_AddIntoBom();
			const AddToPcb = d.getState_AddIntoPcb();
			const foundDevice = results[0];
			const LibraryUuid = results[0].libraryUuid;
			const DeviceUuid = results[0].uuid;
			if (await eda.sch_PrimitiveComponent.delete(uuid)) {
				const CreateResult = await eda.sch_PrimitiveComponent.create({ libraryUuid: LibraryUuid, uuid: DeviceUuid }, DeviceX, DeviceY, SubName, rotation, mirror, AddToBom, AddToPcb);
				if (!CreateResult) { console.log(uuid, "重置成功"); }
			}
			console.log('✅ 找到器件，完整属性如下：', foundDevice);
		}
	});

	document.getElementById('closebutton').addEventListener('click', () => {
		eda.sys_IFrame.closeIFrame();
	});
});

const assert = (cond, msg = 'Assertion failed') => {
	if (!cond) throw new Error(msg);
};
