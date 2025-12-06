const assert = (cond, msg = 'Assertion failed') => {
	if (!cond) throw new Error(msg);
};

document.addEventListener('DOMContentLoaded', async () => {
	const select = document.getElementById('select3'); // 库归属选择
	const schselect = document.getElementById('select1'); // 原理图名称
	const select2 = document.getElementById('select2'); // 搜索字段
	// 注意：必须确保页面中有 id="select4" 的元素
	const select4 = document.getElementById('select4'); // 输出字段

	// 获取项目信息
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

	// 获取库列表
	const libs = await eda.lib_LibrariesList.getAllLibrariesList();

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
	].filter((lib) => lib.uuid && lib.name);

	select.innerHTML =
		'<option value="" disabled selected>请选择库归属</option>' +
		allOptions.map((lib) => `<option value="${lib.uuid}">${lib.name}</option>`).join('');

	// 收集其他属性字段
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

	// 构建搜索字段选项
	const staticOptions = `
    <option value="" disabled selected>请选择搜索字段</option>
    <option value="Device">器件名 (Device)</option>
    <option value="PartNumber">料号 (Part Number)</option>
    <option value="ManufacturerPart">制造商编号(ManufacturerPart)</option>
  `;
	const dynamicOptionsHTML = Array.from(otherPropKeys)
		.sort()
		.map((key) => `<option value="${key}">${key}</option>`)
		.join('');

	select2.innerHTML = staticOptions + dynamicOptionsHTML;

	// 构建输出字段下拉框（如果尚未存在）
	if (!select4.innerHTML) {
		select4.innerHTML = `
      <option value="" disabled selected>请选择输出字段</option>
      <option value="Device">器件名 (Device)</option>
      <option value="PartNumber">料号 (Part Number)</option>
      <option value="ManufacturerPart">制造商编号</option>
      <option value="value">元件值 (value)</option>
      <option value="PartCode">序号 (PartCode)</option>
    `;
	}

	// 开始按钮事件
	document.getElementById('startbutton').addEventListener('click', async () => {
		const libUuid = select.value;
		const searchField = select2.value;
		const outputField = select4.value;

		assert(libUuid, '请选择库归属');
		assert(searchField, '请选择搜索字段');
		assert(outputField, '请选择输出字段');

		const devices = await eda.sch_PrimitiveComponent.getAll('part', true);
		assert(devices.length > 0, '未找到任何可替换的元件');

		const total = devices.length;
		let successCount = 0;
		let failCount = 0;

		// 搜索关键字提取函数
		const searchGetterMap = {
			Device: (d) => d.getState_Name?.(), // 修正：应为 Name 而非 ManufacturerId
			PartNumber: (d) => d.getState_SupplierId?.(),
			ManufacturerPart: (d) => d.getState_ManufacturerId?.(),
			value: (d) => d.getState_Name?.(), // 或从 OtherProperty 中取？
		};

		// 输出更新动作
		const outputActions = {
			Device: (r, d) => {
				const DeviceName = r.name;
				if (DeviceName) {
					d.setState_ManufacturerId(DeviceName);
					d.done();
					return true;
				}
				return false;
			},
			PartNumber: (r, d) => {
				const SupId = r.supplierId;
				if (SupId) {
					d.setState_SupplierId(SupId);
					d.done();
					return true;
				}
				return false;
			},
			ManufacturerPart: (r, d) => {
				const manuId = r.manufacturerId;
				if (manuId) {
					d.setState_ManufacturerId(manuId);
					d.done();
					return true;
				}
				return false;
			},
			value: (r, d) => {
				const DeviceValue = r.value;
				if (DeviceValue) {
					const currentProps = d.getState_OtherProperty() || {};
					d.setState_OtherProperty({ ...currentProps, value: DeviceValue }); // 合并，避免覆盖
					d.done();
					return true;
				}
				return false;
			},
			PartCode: (r, d) => {
				const PartCode = r.ordinal;
				if (PartCode !== undefined && PartCode !== null) {
					const currentProps = d.getState_OtherProperty() || {};
					d.setState_OtherProperty({ ...currentProps, PartCode });
					d.done();
					return true;
				}
				return false;
			},
			Symber: () => false, // 已废弃字段，直接失败
		};

		assert(searchGetterMap[searchField], `未知的搜索字段: ${searchField}`);
		assert(outputActions[outputField], `未知的输出字段: ${outputField}`);

		// 主处理循环
		for (const d of devices) {
			const designator = d.getState_Designator?.() || 'unknown'; //安全调用 这段是AI写的，非空即调 有点der
			const deviceName =
				`<span class="link clicked" data-log-find-sheet="" data-log-find-id="" data-log-find-type="rect" data-log-find-path="">` +
				d.getState_PrimitiveId() +
				`</span>`;
			const getter = searchGetterMap[searchField];
			const keyword = getter ? getter(d) : '';

			eda.sys_Message.showToastMessage(`正在处理 ${successCount + failCount + 1}/${total}`, 'info', 1, null, null, null);

			if (!keyword || String(keyword).trim() === '') {
				const msg = `器件${deviceName} | 原因: 搜索字段 "${searchField}" 为空`;
				eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
				failCount++;
				continue;
			}

			const results = await eda.lib_Device.search(keyword, libUuid, null, null, 10000, 1);
			if (results.length === 0) {
				const msg = `器件${deviceName} | 原因: 未在目标库中找到匹配项 (关键词="${keyword}")`;
				eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
				failCount++;
				continue;
			}

			const result = results[0];
			const actionFn = outputActions[outputField];

			if (outputField === 'Symber') {
				const msg = `器件${deviceName} | 原因: 字段 "${outputField}" 不支持写入`;
				eda.sys_Log.add(`ℹ️ [跳过] ${msg}`, 'warn');
				failCount++;
				continue;
			}

			const isSuccess = actionFn(result, d);

			if (isSuccess) {
				const outputValue = result[outputField] || result.value || result.name || result.supplierId || result.ordinal || '?';
				const msg = `位号${designator}, 器件${deviceName} | 更新 "${outputField}" 为 "${outputValue}"`;
				eda.sys_Log.add(`✅ [成功] ${msg}`, 'info');
				successCount++;
			} else {
				const msg = `位号${designator}, 器件${deviceName} | 原因: 匹配结果中 "${outputField}" 无有效值`;
				eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
				failCount++;
			}
		}

		// 完成提示
		const resultMsg = `✅ 完成！共更新 ${successCount}/${total} 个元件（成功:${successCount}, 失败:${failCount}）`;
		eda.sys_Message.showToastMessage(resultMsg, 'success', 3, null, null, null);

		eda.sys_Log.add('📊 批量更新任务完成', 'info');
		eda.sys_Log.add(`📌 总数: ${total}`, 'info');
		eda.sys_Log.add(`✅ 成功: ${successCount}`, 'info');
		eda.sys_Log.add(`❌ 失败: ${failCount}`, 'info');
	});

	// 关闭按钮
	document.getElementById('closebutton').addEventListener('click', () => {
		eda.sys_IFrame.closeIFrame();
	});
});
