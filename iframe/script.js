async function CloseIFrame() {
	//关闭弹窗
	await eda.sys_IFrame.closeIFrame();
}

function ChangeKey(Value) {
	//字段映射
	switch (Value) {
		case 'title':
		case 'Symber':
		case 'ManufacturerPart':
			return 'manufacturerId';
		case 'PartNumber':
			return 'supplierId';
		case 'value':
			return 'Value';
		default:
			return Value;
	}
}

document.addEventListener('DOMContentLoaded', async () => {
	const SCH_SELECT = document.getElementById('select1'); // 原理图下拉框
	const DEVICE_NAME = document.getElementById('select2'); // 基准属性名下拉框
	const SEARCH_LIB = document.getElementById('select3'); //库归属下拉框
	const UPDATE_VALUE = document.getElementById('select4'); //目标属性值

	const START_BUTTON = document.getElementById('startbutton'); //更新按钮
	const CLOSE_BUTTON = document.getElementById('closebutton'); //取消按钮

	const SCH_DEVICES_INFO = await eda.sch_PrimitiveComponent.getAll('part', true); // 原理图所有器件
	const LIBS_INFO = await eda.lib_LibrariesList.getAllLibrariesList(); //库列表和库UUID
	try {
		//填充当前原理图
		const SCH_INFO = await eda.dmt_Schematic.getCurrentSchematicInfo(); // 获取原理图信息
		SCH_SELECT.innerHTML = ''; // 清空选项
		const option = document.createElement('option');
		option.value = SCH_INFO.name;
		option.text = SCH_INFO.name;
		SCH_SELECT.add(option); // 添加到下拉框
		SCH_SELECT.disabled = true; // 禁用下拉框
	} catch (error) {
		await eda.sys_Message.showToastMessage('意外的错误' + error, 'error', 3);
	}

	try {
		//填充公共参数和其他参数
		const TEMP_DEVICES_ARRAY = [];
		let i = 0;
		while (i < SCH_DEVICES_INFO.length) {
			//收集额外属性
			const keys = Object.keys(SCH_DEVICES_INFO[i].getState_OtherProperty());
			TEMP_DEVICES_ARRAY.push(...keys); //将元素推进去
			i++;
		}
		const DEVICE_INFO_ARRAY = [...new Set(TEMP_DEVICES_ARRAY)]; //数组去重
		DEVICE_INFO_ARRAY.forEach((key) => {
			//对数组中所有的属性执行创建和添加
			const option = document.createElement('option');
			option.value = key; // value
			option.text = key; // text
			DEVICE_NAME.add(option); // 添加到下拉框
		});
	} catch (error) {
		await eda.sys_Message.showToastMessage('遍历器件属性失败: ' + error, 'error', 3);
	}

	try {
		//填充库列表
		LIBS_INFO.forEach((lib) => {
			const option = document.createElement('option');
			option.value = lib.uuid;
			option.text = lib.name;
			SEARCH_LIB.add(option);
		});
	} catch (error) {
		await eda.sys_Message.showToastMessage('加载库列表失败: ' + error.message, 'error', 3);
	}

	START_BUTTON.addEventListener('click', async () => UpdateDeviceInfo(SEARCH_LIB.value));
	CLOSE_BUTTON.addEventListener('click', CloseIFrame);

	async function UpdateDeviceInfo(LibUuid) {
		//返回器件信息
		const NowKey = ChangeKey(DEVICE_NAME.value); //字段映射
		const res = await fetch(`${window.location.origin}/api/v2/devices?path=${LibUuid}&uid=${LibUuid}&page=${1}&pageSize=${100}`);
		const data = await res.json(); //JSON解析
		const currentList = data.result?.lists || []; //目标库器件列表

		try {
			//遍历 SCH_DEVICES_INFO 所有器件
			for (const device of SCH_DEVICES_INFO) {
				//遍历原理图器件
				if (device[NowKey]) {
					//如果有这个属性
					console.log(device[NowKey]); //输出这个属性
					for (d of currentList) {
						//遍历器件库
						if (d[DEVICE_NAME.value]) {
							//如果器件库的值一致
							console.log(d[DEVICE_NAME.value]); //输出
						}
					}
				} else if (device.otherProperty[NowKey]) {
					//一级对象没找到，查询二级对象
					console.log(device.otherProperty[NowKey]); //输出属性
					for (d of currentList) {
						//遍历器件库
						if (d[DEVICE_NAME.value]) {
							//如果器件库的值一致
							console.log(d[DEVICE_NAME.value]); //输出
						}
					}
				} else {
					console.log('未知属性');
					console.log(NowKey);
				}
			}
		} catch (error) {
			await eda.sys_Message.showToastMessage('意外的错误' + error, 'error', 3);
		}
	}
});
