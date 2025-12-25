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
	// 字段映射
	//两种映射
	switch (key) {
		case 'manufacturerId':
			return 'Manufacturer Part';
		case 'supplierId':
			return 'Supplier Part';
		default:
			return key;
	}
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
// 使用基准属性去和对应的属性匹配,如果值相等那么就刷新
document.addEventListener('DOMContentLoaded', async () => {
	const SCH_SELECT = document.getElementById('select1'); //原理图
	const DEVICE_NAME = document.getElementById('select2'); //基准属性
	const SEARCH_LIB = document.getElementById('select3'); //库
	const UPDATE_VALUE = document.getElementById('select4'); //查询属性
	const START_BUTTON = document.getElementById('startbutton');
	const CLOSE_BUTTON = document.getElementById('closebutton');
	const SCH_DEVICES_INFO = await eda.sch_PrimitiveComponent.getAll('part', true); //原理图中所有器件数组
	const LIBS_INFO = await eda.lib_LibrariesList.getAllLibrariesList(); //库列表
	const SCH_INFO = await eda.dmt_Schematic.getCurrentSchematicInfo(); //整个项目信息

	try {
		//当前选定的原理图
		SCH_SELECT.innerHTML = '';
		const option = document.createElement('option');
		option.value = SCH_INFO.name;
		option.text = SCH_INFO.name;
		SCH_SELECT.add(option);
		SCH_SELECT.disabled = true;
	} catch (error) {
		await eda.sys_Message.showToastMessage('意外的错误' + error, 'error', 3);
	}

	try {
		//同时推进基准属性名下拉框和更新属性名下拉框
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
	} catch (error) {
		await eda.sys_Message.showToastMessage('遍历器件属性失败: ' + error, 'error', 3);
	}

	try {
		// 库列表下拉框
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
		const total = SCH_DEVICES_INFO.length; //原理图器件数组长度
		let successCount = 0;
		let failCount = 0;
		const OldValue = DEVICE_NAME.value;
		const mappedKeyForLib = ChangeKey(OldValue);
		const newvalue = UPDATE_VALUE.value;
		const res = await fetch(`${window.location.origin}/api/v2/devices?path=${LibUuid}&uid=${LibUuid}&page=1&pageSize=10000`);
		if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
		const data = await res.json();
		const currentList = data.result?.lists || [];
		for (let idx = 0; idx < total; idx++) {
			const a = SCH_DEVICES_INFO[idx];
			let matched = false;
			let symbol = await eda.lib_Symbol.get(a.getState_Symbol().uuid, a.getState_Symbol().libraryUuid);
			symbol = symbol.name;
			console.log(symbol);
			let schdevice;
			if (OldValue === 'device') {
				schdevice = removeTrailingDotNumber(a.getState_SubPartName());
			} else if (OldValue === 'symbol') {
				schdevice = symbol;
			} else {
				schdevice = bfs(a, OldValue)?.[OldValue];
			}
			const designator = a.getState_Designator();
			const rawDeviceId = a.getState_PrimitiveId();
			const convertedDeviceId = convertId(rawDeviceId);
			const deviceName = `<span class="link" data-log-find-id="${convertedDeviceId}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${designator}</span>`;
			if (schdevice == null) {
				const errMsg = '无基准属性值';
				const msg = `器件${deviceName} | 替换失败: ${errMsg}`;
				await eda.sys_Log.add(msg, 'error');
				failCount++;
				const resultMsg = `进度 (${idx + 1}/${total})`;
				await eda.sys_Message.showToastMessage(resultMsg, 'info', 3, null, null, null);
				continue;
			}
			for (const b of currentList) {
				let libValue;
				if (OldValue === 'device') {
					libValue = bfs(b, 'display_title')?.['display_title'];
				} else if (OldValue === 'symbol') {
					libValue = bfs(b, 'title')?.['title'];
				} else {
					libValue = bfs(b, mappedKeyForLib)?.[mappedKeyForLib];
				}
				const targetObj = bfs(b, ChangeKey(newvalue));
				if (schdevice == libValue && targetObj) {
					const targetValue = targetObj[ChangeKey(newvalue)];
					if (targetValue == null) {
						const errMsg = '匹配成功但目标字段为空';
						const msg = `器件${deviceName} | 替换失败: ${errMsg}`;
						await eda.sys_Log.add(msg, 'error');
						failCount++;
						matched = true;
						break;
					}
					let update_result;
					switch (newvalue) {
						case 'manufacturerId':
							update_result = a.setState_ManufacturerId(targetValue);
							break;
						case 'supplierId':
							update_result = a.setState_SupplierId(targetValue);
							break;
						default:
							update_result = a.setState_OtherProperty(newvalue, targetValue);
					}
					successCount++;
					const msg = `器件${deviceName}, ${a.getState_SubPartName()} 已根据查找到的器件 "${a.getState_SubPartName()}" 进行属性参数刷新成功`;
					await eda.sys_Log.add(msg, 'info');
					a.done();
					matched = true;
					break;
				}
			}
			if (!matched) {
				const errMsg = '未找到匹配的库器件';
				const msg = `器件${deviceName} | 替换失败: ${errMsg}`;
				await eda.sys_Log.add(msg, 'error');
				failCount++;
			}
			const resultMsg = `进度 (${idx + 1}/${total})`;
			await eda.sys_Message.showToastMessage(resultMsg, 'info', 3, null, null, null);
		}
		await eda.sys_Log.add(`替换任务汇总 总数: ${total} 成功: ${successCount} 失败: ${failCount}`, 'info');
		console.log(currentList);
		console.log(SCH_DEVICES_INFO);
	}
});
