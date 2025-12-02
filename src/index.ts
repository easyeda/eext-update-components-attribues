// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activate(status?: 'onStartupFinished', arg?: string): void {}

export function deleteAndPlaceNew(): void {
	eda.sys_IFrame.openIFrame('/iframe/update.html', 470, 380);
}

export function updateAttributes(): void {
	eda.sys_IFrame.openIFrame('/iframe/index.html', 470, 380);
}

export function debug(): void {
	eda.sys_IFrame.openIFrame('/iframe/debug/index.html', 600, 500);
}
