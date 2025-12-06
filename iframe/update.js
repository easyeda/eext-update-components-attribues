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

		const firstSchematic = data.find((item) => item?.schematic?.name)?.schematic?.name;

		if (firstSchematic) {
			schselect.innerHTML = `<option value="${firstSchematic}" selected>${firstSchematic}</option>`;
		} else {
			schselect.innerHTML = '<option value="" disabled selected>无可用原理图</option>';
		}
	} catch (e) {
		eda.sys_Log.add('加载原理图失败: ' + (e.message || String(e)), 'error');
		schselect.innerHTML = '<option value="" disabled selected>加载失败</option>';
	}

	try {
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
	} catch (e) {
		eda.sys_Log.add('加载库列表失败: ' + (e.message || String(e)), 'error');
		select.innerHTML = '<option value="" disabled selected>加载失败</option>';
	}

	try {
		const allDevices = await eda.sch_PrimitiveComponent.getAll('part', true);
		const otherPropKeys = new Set();

		for (const device of allDevices) {
			const props = device.getState_OtherProperty();
			if (props && typeof props === 'object' && !Array.isArray(props)) {
				Object.keys(props).forEach((key) => {
					const k = key.trim();
					if (k) otherPropKeys.add(k);
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
	} catch (e) {
		eda.sys_Log.add('动态加载 OtherProperty 字段失败: ' + (e.message || String(e)), 'error');
	}

	document.getElementById('startbutton').addEventListener('click', async () => {
		const searchField = select2.value;
		const libUuid = select.value;

		assert(libUuid, '请选择库归属');
		assert(searchField, '请选择搜索字段');

		const devices = await eda.sch_PrimitiveComponent.getAll('part', true);
		assert(devices.length > 0, '未找到任何可替换的元件');

		const total = devices.length;
		let successCount = 0;
		let failCount = 0;

		const searchGetterMap = {
			Device: (d) => d.getState_Name(),
			PartNumber: (d) => d.getState_SupplierId(),
			Symber: (d) => d.getState_Name(),
			ManufacturerPart: (d) => d.getState_ManufacturerId(),
			value: (d) => d.getState_Name(),
			PartCode: (d) => d.getState_Designator(),
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
			console.log(d.getState_OtherProperty());
			const designator = d.getState_Designator?.() || 'unknown';
			const deviceName =
				`<span class="link clicked" data-log-find-sheet="" data-log-find-id="" data-log-find-type="rect" data-log-find-path="">` +
				d.getState_PrimitiveId() +
				`</span>`;
			let keyword = null;

			try {
				keyword = getSearchValue(d, searchField);
				if (!keyword) {
					const msg = `器件${deviceName} | 原因: 搜索字段 "${searchField}" 无有效值`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
					failCount++;
					continue;
				}

				eda.sys_Message.showToastMessage(`正在处理 ${successCount + failCount + 1}/${total}`, 'info', 1, null, null, null);

				const results = await eda.lib_Device.search(keyword, libUuid, null, null, 10000, 1);
				if (results.length === 0) {
					const msg = `器件${deviceName} | 原因: 未在目标库中找到匹配项 (关键词="${keyword}")`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
					failCount++;
					continue;
				}

				const targetDevice = results[0];
				const uuid = d.getState_PrimitiveId();
				const deleteResult = await eda.sch_PrimitiveComponent.delete(uuid);

				if (!deleteResult) {
					const msg = `器件${deviceName} | 原因: 删除原始元件失败 (PrimitiveId=${uuid})`;
					eda.sys_Log.add(`❌ [失败] ${msg}`, 'error');
					failCount++;
					continue;
				}

				const tempComp = d.getState_Component();
				tempComp.libraryUuid = libUuid;

				const newComp = await eda.sch_PrimitiveComponent.create(
					tempComp,
					d.getState_X(),
					d.getState_Y(),
					d.getState_SubPartName(),
					d.getState_Rotation(),
					d.getState_Mirror(),
					d.getState_AddIntoBom(),
					d.getState_AddIntoPcb(),
				);

				newComp.setState_Designator(d.getState_Designator());
				newComp.setState_UniqueId(d.getState_UniqueId());
				newComp.done();

				const msg = `器件${deviceName} | 已替换为库中器件: ${targetDevice.name}`;
				eda.sys_Log.add(`✅ [成功] ${msg}`, 'info');
				successCount++;
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				const msg = `器件${deviceName} | 替换失败: ${errMsg}`;
				eda.sys_Log.add(`❌ [异常] ${msg}`, 'error');
				failCount++;
			}
		}

		const resultMsg = `✅ 完成！共替换 ${successCount}/${total} 个元件（成功:${successCount}, 失败:${failCount}）`;
		eda.sys_Message.showToastMessage(resultMsg, 'success', 3, null, null, null);

		eda.sys_Log.add('📊 替换任务汇总', 'info');
		eda.sys_Log.add(`📌 总数: ${total}`, 'info');
		eda.sys_Log.add(`✅ 成功: ${successCount}`, 'info');
		eda.sys_Log.add(`❌ 失败: ${failCount}`, 'info');
	});

	document.getElementById('closebutton').addEventListener('click', () => {
		eda.sys_IFrame.closeIFrame();
	});
});
