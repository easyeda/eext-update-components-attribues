/*==============================================================================================================================*/
// 辅助函数：将 Primitive ID 转换为可用于定位的 ID
function convertId(id) {
	return id.replace(/^\$1I/, 'e');
}

// 关闭弹窗
async function CloseIFrame() {
	await eda.sys_IFrame.closeIFrame();
}

/**
 * 更新原理图器件的属性
 * @param {object} sch_obj - 原理图器件对象
 * @param {object} lib_obj - 从库中找到的匹配器件对象
 * @param {string} update_type - 要更新的属性类型 (例如: "ManufacturerPart")
 * @returns {Promise<{success: boolean, value: string|null}>}
 */
async function update(sch_obj, lib_obj, update_type) {
	try {
		let newValue = null;
		// 将UI选择的更新类型，映射为库 attributes 中的键名
		const libKey = changeKeyForUpdate(update_type);
		newValue = lib_obj.attributes ? lib_obj.attributes[libKey] : null;

		if (newValue) {
			// 根据UI选择的更新类型，调用对应的API
			if (update_type === 'ManufacturerPart') {
				await sch_obj.setState_ManufacturerId(newValue);
			} else if (update_type === 'Supplier Part') {
				await sch_obj.setState_SupplierId(newValue);
			} else {
				// 对于所有其他属性（包括Value），统一使用通用方法更新
				await sch_obj.setState_OtherProperty(update_type, newValue);
			}
		} else {
			return { success: false, value: null };
		}

		// 保存更改
		await sch_obj.done();
		return { success: true, value: newValue };
	} catch (error) {
		console.error(`更新器件 ${sch_obj.designator} 时出错:`, error);
		throw error;
	}
}

/**
 * 在库列表中查找匹配的器件
 */
async function FindKey(obj, libraryKey, value) {
	for (const d of obj) {
		if (d.attributes && d.attributes[libraryKey] == value) {
			return d;
		}
	}
	return null;
}

/**
 * 将UI选择的值映射为原理图对象的属性路径，用于获取匹配值
 */
function ChangeKey(Value) {
	switch (Value) {
		case 'ManufacturerPart':
		case 'title':
		case 'Symber':
			return 'manufacturerId';
		case 'Supplier Part':
			return 'supplierId';
		case 'Designator':
			return 'designator';
		default:
			// 对于所有未明确列出的属性（包括Value），都视为 otherProperty 中的属性
			return `otherProperty.${Value}`;
	}
}

/**
 * 将UI选择的值映射为库器件 attributes 中的键名，用于获取新值 这里其实是因为原理图的字段和库器件字段不一致导致需要映射
 */
function changeKeyForUpdate(Value) {
	switch (Value) {
		case 'ManufacturerPart':
			return 'Manufacturer Part';
		case 'Supplier Part':
			return 'Supplier Part';
		default:
			// 如果以上都不是那么直接返回就行
			return Value;
	}
}

/*==============================================================================================================================*/
document.addEventListener('DOMContentLoaded', async () => {
	const SCH_SELECT = document.getElementById('select1');
	const DEVICE_NAME = document.getElementById('select2'); // 用于选择匹配字段
	const SEARCH_LIB = document.getElementById('select3');
	const UPDATE_VALUE = document.getElementById('select4'); // 用于选择更新字段
	const START_BUTTON = document.getElementById('startbutton');
	const CLOSE_BUTTON = document.getElementById('closebutton');

	const SCH_DEVICES_INFO = await eda.sch_PrimitiveComponent.getAll('part', true);
	const LIBS_INFO = await eda.lib_LibrariesList.getAllLibrariesList();

	let DocInfo;
	try {
		DocInfo = await eda.dmt_Schematic.getCurrentSchematicInfo();
	} catch (error) {
		console.error('无法获取原理图信息，日志链接可能失效。', error);
		DocInfo = { page: [{ uuid: '' }], parentProjectUuid: '' };
	}

	// 初始化UI
	try {
		SCH_SELECT.innerHTML = '';
		const option = document.createElement('option');
		option.value = DocInfo.name;
		option.text = DocInfo.name;
		SCH_SELECT.add(option);
		SCH_SELECT.disabled = true;
	} catch (error) {
		await eda.sys_Message.showToastMessage('初始化原理图选择框失败' + error, 'error', 3);
	}

	try {
		// 收集所有可能的属性名，用于填充下拉框
		const allKeys = new Set();
		SCH_DEVICES_INFO.forEach((device) => {
			// 添加顶层属性
			allKeys.add('ManufacturerPart');
			allKeys.add('Supplier Part');
			allKeys.add('Value');
			allKeys.add('Designator');
			// 添加 otherProperty 中的属性
			if (device.otherProperty) {
				Object.keys(device.otherProperty).forEach((key) => {
					// 过滤掉纯数字键 其实这一步可以不加 但是不知道为啥原理图中突然出现了一些莫名其妙的参数 所以需要过滤以下
					if (!/^\d+$/.test(key)) {
						allKeys.add(key);
					}
				});
			}
		});

		// 填充匹配字段下拉框
		[...allKeys].sort().forEach((key) => {
			const option = document.createElement('option');
			option.value = key;
			option.text = key;
			DEVICE_NAME.add(option);
		});
		// 填充更新字段下拉框，内容与匹配字段相同
		UPDATE_VALUE.innerHTML = DEVICE_NAME.innerHTML;
	} catch (error) {
		await eda.sys_Message.showToastMessage('遍历器件属性失败: ' + error, 'error', 3);
	}

	try {
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

	/**
	 * 主更新函数
	 */
	async function UpdateDeviceInfo(LibUuid) {
		if (!LibUuid) {
			await eda.sys_Message.showToastMessage('请选择一个库！', 'error', 3);
			return;
		}

		// 获取用于匹配的属性路径
		const schematicKeyPath = ChangeKey(DEVICE_NAME.value);
		if (!schematicKeyPath) {
			await eda.sys_Message.showToastMessage('无效的搜索字段！', 'error', 3);
			return;
		}

		let currentList = [];
		try {
			const res = await fetch(`${window.location.origin}/api/v2/devices?path=${LibUuid}&uid=${LibUuid}&page=${1}&pageSize=${10000}`);
			const data = await res.json();
			currentList = data.result?.lists || [];
			if (currentList.length === 0) {
				await eda.sys_Message.showToastMessage('所选库中没有找到任何器件！', 'error', 3);
				return;
			}
		} catch (error) {
			await eda.sys_Message.showToastMessage('从库获取器件列表失败: ' + error.message, 'error', 3);
			return;
		}

		let successCount = 0;
		let failCount = 0;
		const total = SCH_DEVICES_INFO.length;

		try {
			for (const device of SCH_DEVICES_INFO) {
				const designator = device.designator || 'unknown';
				const PinId = convertId(device.getState_PrimitiveId());
				const deviceName = `<span class="link" data-log-find-id="${PinId}" data-log-find-sheet="${DocInfo.page[0].uuid}" data-log-find-type="rect" data-log-find-path="${DocInfo.parentProjectUuid}">${designator}</span>`;
				await eda.sys_Message.showToastMessage(`正在处理 ${successCount + failCount + 1}/${total}`, 'info', 1, null, null, null);
				// 根据路径获取用于匹配的值
				let targetValue;
				if (schematicKeyPath.startsWith('otherProperty.')) {
					const propKey = schematicKeyPath.substring('otherProperty.'.length);
					targetValue = device.otherProperty ? device.otherProperty[propKey] : null;
				} else {
					targetValue = device[schematicKeyPath];
				}

				if (!targetValue) {
					const msg = `位号 ${designator} (${deviceName}) | 原因: 搜索字段 "${DEVICE_NAME.value}" 为空`;
					eda.sys_Log.add(`❌ [跳过] ${msg}`, 'error');
					failCount++;
					continue;
				}

				//在库中查找
				const libraryKey = changeKeyForUpdate(DEVICE_NAME.value);
				const foundInLibrary = await FindKey(currentList, libraryKey, targetValue);

				if (!foundInLibrary) {
					const msg = `位号 ${designator} (${deviceName}) | 原因: 在库中未找到匹配项 (搜索值: ${targetValue})`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
					failCount++;
					continue;
				}

				//如果找到，则执行更新
				try {
					const updateResult = await update(device, foundInLibrary, UPDATE_VALUE.value);
					if (updateResult.success) {
						const msg = `位号 ${designator} (${deviceName}) 已成功更新 "${UPDATE_VALUE.value}" 为: ${updateResult.value}`;
						eda.sys_Log.add(`✅ [成功] ${msg}`, 'info');
						successCount++;
					} else {
						const msg = `位号 ${designator} (${deviceName}) | 原因: 匹配的库器件中 "${UPDATE_VALUE.value}" 无有效值`;
						eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
						failCount++;
					}
				} catch (updateError) {
					const msg = `位号 ${designator} (${deviceName}) | 原因: 更新时发生错误 - ${updateError.message}`;
					eda.sys_Log.add(`💥 [错误] ${msg}`, 'error');
					failCount++;
				}
			}

			const resultMsg = `✅ 完成！共处理 ${total} 个元件（成功: ${successCount}, 失败/跳过: ${failCount}）`;
			await eda.sys_Message.showToastMessage(resultMsg, 'success', 5);

			eda.sys_Log.add('批量更新任务完成', 'info');
			eda.sys_Log.add(`总数: ${total} 成功: ${successCount} 失败/跳过: ${failCount}`, 'info');
		} catch (error) {
			await eda.sys_Message.showToastMessage('更新过程中发生意外错误: ' + error.message, 'error', 3);
			eda.sys_Log.add(`💥 [致命错误] 更新过程中断: ${error.message}`, 'error');
		}
	}
});
