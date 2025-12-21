async function CloseIFrame() {
	// 关闭弹窗
	await eda.sys_IFrame.closeIFrame();
}

function removeTrailingDotNumber(str) {
	return str.replace(/\.\d+$/, '');
}

function convertId(id) {
	//转换位号为可用格式
	return id.replace(/^\$1I/, 'e');
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
			// 填充下拉框属性
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
		const OldValue = DEVICE_NAME.value;
		const mappedKeyForLib = ChangeKey(OldValue); // 注意：device 不走 ChangeKey，单独处理
		const res = await fetch(`${window.location.origin}/api/v2/devices?path=${LibUuid}&uid=${LibUuid}&page=1&pageSize=10000`);
		const data = await res.json();
		const currentList = data.result?.lists || [];
		const total = SCH_DEVICES_INFO.length;

		try {
			for (let idx = 0; idx < total; idx++) {
				const d = SCH_DEVICES_INFO[idx];
				// === 特殊处理 device 字段 ===
				let schVal;
				if (OldValue === 'device') {
					schVal = removeTrailingDotNumber(d.getState_SubPartName());
				} else {
					const schObj = bfs(d, OldValue);
					schVal = schObj?.[OldValue];
				}

				const designator = d.getState_Designator();
				const rawDeviceId = d.getState_PrimitiveId();
				const convertedDeviceId = convertId(rawDeviceId);
				const deviceName = `<span class="link" data-log-find-id="${convertedDeviceId}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${designator}</span>`;

				if (schVal == null) {
					const msg = `器件${deviceName} | 替换失败: 无基准属性值`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
					const resultMsg = `进度 (${idx + 1}/${total})`;
					await eda.sys_Message.showToastMessage(resultMsg, 'info', 3, null, null, null);
					continue;
				}

				let matched = false;
				for (const c of currentList) {
					// === 库侧也特殊处理 device ===
					let libVal;
					if (OldValue === 'device') {
						const titleObj = bfs(c, 'display_title');
						libVal = titleObj?.['display_title'];
					} else {
						const libObj = bfs(c, mappedKeyForLib);
						libVal = libObj?.[mappedKeyForLib];
					}

					if (String(libVal) === String(schVal)) {
						const component = { libraryUuid: LibUuid, uuid: bfs(c, 'uuid')?.uuid };
						try {
							await eda.sch_PrimitiveComponent.delete(d.getState_PrimitiveId());
							const newComp = await eda.sch_PrimitiveComponent.create(
								component,
								d.getState_X(),
								d.getState_Y(),
								d.getState_SubPartName(),
								d.getState_Rotation(),
								d.getState_Mirror(),
								d.getState_AddIntoBom(),
								d.getState_AddIntoPcb(),
							);
							const newRawId = newComp.getState_PrimitiveId();
							const newConvertedId = convertId(newRawId);
							const newDeviceName = `<span class="link" data-log-find-id="${newConvertedId}" data-log-find-sheet="${SCH_INFO.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${SCH_INFO.parentProjectUuid}">${designator}</span>`;
							newComp.setState_Designator(d.getState_Designator()); //写回位号
							newComp.setState_UniqueId(d.getState_UniqueId()); //写回唯一ID
							newComp.done();
							const msg = `${newDeviceName}, ${d.getState_SubPartName()} 已根据查找到的器件 "${d.getState_SubPartName()}" 进行属性参数刷新成功`;
							eda.sys_Log.add(`✅ [成功] ${msg}`, 'info');
						} catch (错误) {
							const msg = `器件${deviceName} | 替换失败: 创建新器件时出错`;
							eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
						}
						matched = true;
						break;
					}
				}

				if (!matched) {
					const msg = `器件${deviceName} | 替换失败: 未找到匹配的库器件 (值: ${schVal})`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
				}

				const resultMsg = `进度 (${idx + 1}/${total})`;
				await eda.sys_Message.showToastMessage(resultMsg, 'info', 3, null, null, null);
			}
		} catch (error) {
			await eda.sys_Message.showToastMessage('意外的错误: ' + (error.message || error), 'error', 3);
		}
	}
});
