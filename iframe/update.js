async function CloseIFrame() {
	//关闭当前窗口
	await eda.sys_IFrame.closeIFrame();
}

function removeTrailingDotNumber(str) {
	//将子图块名称替换回器件名
	return str.replace(/\.\d+$/, '');
}

function convertId(id) {
	// 将图元ID转换为可被点击的超链接
	return id.replace(/^\$1I/, 'e');
}

function ChangeKey(key) {
	//字段映射
	return (
		{
			'manufacturerId': 'Manufacturer Part',
			'Manufacturer Part': 'manufacturerId',
			'supplierId': 'Supplier Part',
			'Supplier Part': 'supplierId',
			'device': 'subPartName',
		}[key] || key
	);
}

function bfs(obj, key) {
	//广度优先搜索
	if (typeof obj !== 'object' || obj === null) return null;
	const queue = [obj];
	while (queue.length > 0) {
		const current = queue.shift();
		if (current.hasOwnProperty(key)) return current;
		for (const prop in current) {
			if (current.hasOwnProperty(prop)) {
				const value = current[prop];
				if (typeof value === 'object' && value !== null) queue.push(value);
			}
		}
	}
	return null;
}
/*====================================================以上为基准函数==============================================================================*/

document.addEventListener('DOMContentLoaded', async () => {
	// 使用基准属性去和对应的属性匹配,如果值相等那么就刷新
	const SCH_SELECT = document.getElementById('select1'); //原理图
	const DEVICE_NAME = document.getElementById('select2'); //基准属性
	const SEARCH_LIB = document.getElementById('select3'); //库
	const UPDATE_VALUE = document.getElementById('select4'); //查询属性
	const START_BUTTON = document.getElementById('startbutton');
	const CLOSE_BUTTON = document.getElementById('closebutton');
	const SCH_DEVICES_INFO = await eda.sch_PrimitiveComponent.getAll('part', true); //原理图中所有器件数组
	const LIBS_INFO = await eda.lib_LibrariesList.getAllLibrariesList(); //库列表
	const SCH_INFO = await eda.dmt_Schematic.getCurrentSchematicInfo(); //整个项目信息
	/*===============================================以上为全局属性====================================================================================================*/

	//展示当前原理图
	SCH_SELECT.innerHTML = '';
	const option = document.createElement('option');
	option.value = SCH_INFO.name;
	option.text = SCH_INFO.name;
	SCH_SELECT.add(option);
	SCH_SELECT.disabled = true;
	//属性下拉框
	const TEMP_DEVICES_ARRAY = [];
	let i = 0;
	while (i < SCH_DEVICES_INFO.length) {
		const keys = Object.keys(SCH_DEVICES_INFO[i].getState_OtherProperty());
		TEMP_DEVICES_ARRAY.push(...keys);
		i++;
	}
	const DEVICE_INFO_ARRAY = [...new Set(TEMP_DEVICES_ARRAY)];
	DEVICE_INFO_ARRAY.forEach((key) => {
		const option = document.createElement('option');
		option.value = key;
		option.text = key;
		DEVICE_NAME.add(option);

		const option1 = document.createElement('option');
		option1.value = key;
		option1.text = key;
		UPDATE_VALUE.add(option1);
	});
	//库列表
	LIBS_INFO.forEach((lib) => {
		const option = document.createElement('option');
		option.value = lib.uuid;
		option.text = lib.name;
		SEARCH_LIB.add(option);
	});
	/*============================================================以上为UI相关函数======================================================================*/

	async function UpdateDeviceInfo(LibUuid) {
		//核心函数 刷新器件属性
		const res = await fetch(`${window.location.origin}/api/v2/devices?path=${LibUuid}&uid=${LibUuid}&page=1&pageSize=100000000`); //请求接口获得返回值
		const data = await res.json(); //解析返回值
		const currentList = data.result?.lists || []; //指定器件库中的器件列表
		const JiZhun = ChangeKey(DEVICE_NAME.value); //映射后的基准属性值
		const ChaXun = UPDATE_VALUE.value; //查询的指定属性值
		var success = 0; //成功次数
		var field = 0; //失败次数
		var temp = SCH_DEVICES_INFO.length; //总次数
		console.log('当前基准属性', JiZhun);
		console.log('当前查询属性', ChaXun);
		for (const s of SCH_DEVICES_INFO) {
			let sch_value = bfs(s, JiZhun)?.[JiZhun]; //查询到的指定的键的值
			if (sch_value != undefined && sch_value != null) {
				sch_value = removeTrailingDotNumber(sch_value);

				let foundMatch = false;

				for (const c of currentList) {
					const temp_value = bfs(c, ChaXun)?.[ChaXun];
					const addToBom = c?.['attributes']?.['Add into BOM'] === 'yes';
					const ConvertToPcb = c?.['attributes']?.['Convert to PCB'] === 'yes';
					const Manufacturer = c?.['attributes']?.['Manufacturer'];
					const ManufacturerPart = c?.['attributes']?.['Manufacturer Part'];
					const Supplier = c?.['attributes']?.['Supplier'];
					const SupplierPart = c?.['attributes']?.['Supplier Part'];
					const attributes = c?.['attributes'];
					if (temp_value === sch_value) {
						//如果两个键的值一致
						const newdevice = await eda.sch_PrimitiveComponent.create(
							s.getState_Component(),
							s.getState_X(),
							s.getState_Y(),
							s.getState_SubPartName(),
							s.getState_Rotation(),
							s.getState_Mirror(),
							s.getState_AddIntoBom(),
							s.getState_AddIntoPcb(),
						);
						success++;
						newdevice.setState_UniqueId(s.getState_UniqueId());
						newdevice.setState_Designator(s.getState_Designator());
						const delete_result = await eda.sch_PrimitiveComponent.delete(s);
						newdevice.done();
						const designator = newdevice.getState_Designator(); //位号
						const rawDeviceId = newdevice.getState_PrimitiveId(); //图元ID
						const convertedDeviceId = convertId(rawDeviceId); //转换后的图元ID
						const deviceName = `<span class="link" data-log-find-id="${convertedDeviceId}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${designator}</span>`;
						const msg = `${deviceName}, ${newdevice.getState_SubPartName()} 已根据查找到的器件 "${newdevice.getState_SubPartName()}" 进行属性参数刷新成功`;
						eda.sys_Log.add(`✅ [成功] ${msg}`, 'info');

						foundMatch = true;
						break;
					}
				}

				if (!foundMatch) {
					field++;
					const designator = s.getState_Designator(); //位号
					const rawDeviceId = s.getState_PrimitiveId(); //图元ID
					const convertedDeviceId = convertId(rawDeviceId); //转换后的图元ID
					const deviceName = `<span class="link" data-log-find-id="${convertedDeviceId}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${designator}</span>`;
					const msg = `${deviceName}, ${s.getState_SubPartName()}没有对应的属性`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
				}
			} else {
				// 原理图中无基准属性值，也视为失败（保持原逻辑结构）
				field++;
				const designator = s.getState_Designator();
				const rawDeviceId = s.getState_PrimitiveId();
				const convertedDeviceId = convertId(rawDeviceId);
				const deviceName = `<span class="link" data-log-find-id="${convertedDeviceId}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${designator}</span>`;
				const msg = `${deviceName}, ${s.getState_SubPartName()}没有对应的属性`;
				eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
			}
			await eda.sys_Message.showToastMessage(`${success + field}/${temp}`, 'info');
		}
		await eda.sys_Message.showToastMessage('元器件替换完成', 'info');
		await eda.sys_Log.add(`本次任务成功替换器件${success}个，失败${field}个`, 'info');
		console.log(currentList);
		console.log(SCH_DEVICES_INFO);
	}

	START_BUTTON.addEventListener('click', async () => UpdateDeviceInfo(SEARCH_LIB.value));
	CLOSE_BUTTON.addEventListener('click', CloseIFrame);
});
