async function CloseIFrame() {
	// 关闭弹窗
	await eda.sys_IFrame.closeIFrame();
}

function removeTrailingDotNumber(str) {
	//子图块名称转换为器件名
	return str.replace(/\.\d+$/, '');
}

// const ContorlLog = console.log;
// console.log = async function(messgae, type = 'info') {
// 	try {
// 		await eda.sys_Log.add(messgae, type);
// 	} catch (e) {
// 		await eda.sys_Log.add(e, 'error');
// 	}
// }

function ChangeKey(key) {
	// API两边设计不一致所以需要映射
	switch (key) {
		case 'manufacturerId':
			return 'Manufacturer Part';
		case 'supplierId':
			return 'Supplier Part';
		default:
			return key;
	}
}

//取键 返回当前层对象
function bfs(obj, key) {
	if (typeof obj !== 'object' || obj === null) {
		return null;
	}
	const queue = [obj];
	while (queue.length > 0) {
		const current = queue.shift();
		// 检查当前对象是否包含目标键
		if (current.hasOwnProperty(key)) {
			return current;
		}
		// 将当前对象的所有子对象加入队列
		for (const prop in current) {
			if (current.hasOwnProperty(prop)) {
				const value = current[prop];
				if (typeof value === 'object' && value !== null) {
					queue.push(value);
				}
			}
		}
	}
	return null; // 未找到
}

document.addEventListener('DOMContentLoaded', async () => {
	const SCH_SELECT = document.getElementById('select1'); // 原理图下拉框
	const DEVICE_NAME = document.getElementById('select2'); // 基准属性名下拉框
	const SEARCH_LIB = document.getElementById('select3'); // 库归属下拉框
	const UPDATE_VALUE = document.getElementById('select4'); // 目标属性值

	const START_BUTTON = document.getElementById('startbutton'); // 更新按钮
	const CLOSE_BUTTON = document.getElementById('closebutton'); // 取消按钮

	const SCH_DEVICES_INFO = await eda.sch_PrimitiveComponent.getAll('part', true); // 原理图所有器件
	const LIBS_INFO = await eda.lib_LibrariesList.getAllLibrariesList(); // 库列表和库UUID

	const SCH_INFO = await eda.dmt_Schematic.getCurrentSchematicInfo(); // 获取原理图信息
	try {
		// 填充当前原理图
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
		// 填充公共参数和其他参数
		const TEMP_DEVICES_ARRAY = [];
		let i = 0;
		while (i < SCH_DEVICES_INFO.length) {
			// 收集额外属性
			const keys = Object.keys(SCH_DEVICES_INFO[i].getState_OtherProperty());
			TEMP_DEVICES_ARRAY.push(...keys); // 将元素推进去
			i++;
		}
		const DEVICE_INFO_ARRAY = [...new Set(TEMP_DEVICES_ARRAY)]; // 数组去重
		DEVICE_INFO_ARRAY.forEach((key) => {
			// 对数组中所有的属性执行创建和添加
			const option = document.createElement('option');
			option.value = key; // value
			option.text = key; // text
			DEVICE_NAME.add(option); // 添加到下拉框
		});
	} catch (error) {
		await eda.sys_Message.showToastMessage('遍历器件属性失败: ' + error, 'error', 3);
	}

	try {
		// 填充库列表
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
		try {
			const OldValue = DEVICE_NAME.value; // 基准属性名
			const value = ChangeKey(DEVICE_NAME.value); // 映射后的库查询字段
			const newvalue = UPDATE_VALUE.value; // 目标更新字段

			const res = await fetch(`${window.location.origin}/api/v2/devices?path=${LibUuid}&uid=${LibUuid}&page=1&pageSize=10000`);
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			const data = await res.json();
			const currentList = data.result?.lists || [];

			let success = 0;
			for (const a of SCH_DEVICES_INFO) {
				let matched = false;
				let schdevice = OldValue === 'device' ? removeTrailingDotNumber(a.getState_SubPartName()) : bfs(a, OldValue)?.[OldValue]; // 获取原理图中的基准值
				if (schdevice == null) {
					console.log(a.getState_Designator(), '无基准属性值');
					continue;
				}

				for (const b of currentList) {
					let libValue = OldValue === 'device' ? bfs(b, 'display_title')?.['display_title'] : bfs(b, value)?.[value]; // 库中用于匹配的值
					const targetObj = bfs(b, ChangeKey(newvalue)); // 提前获取目标字段对象以避免重复调用
					if (schdevice == libValue && targetObj) {
						const targetValue = targetObj[ChangeKey(newvalue)];
						if (targetValue == null) {
							console.log(a.getState_Designator(), '匹配成功但目标字段为空');
							continue;
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
						success++;
						const newComp = a;
						const device = newComp.getState_PrimitiveId();
						const deviceName = `<span class="link" data-log-find-id="${device}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${a.getState_Designator()}</span>`;
						const msg = `${deviceName}, ${a.getState_SubPartName()} 已根据查找到的器件 "${a.getState_SubPartName()}" 进行属性参数刷新成功`;
						// console.log(`${a.getState_Designator()} 更新成功 (${success})：${schdevice} → ${targetValue}`);
						a.done();
						matched = true;
						break;
					}
				}
				if (!matched) console.log(a.getState_Designator(), '未找到匹配的库器件');
			}
			if (success > 0) await eda.sys_Message.showToastMessage(`成功更新 ${success} 个器件`, 'success', 3);
		} catch (error) {
			console.error('UpdateDeviceInfo error:', error);
			await eda.sys_Message.showToastMessage('更新失败: ' + (error.message || error), 'error', 3);
		}
	}
});
