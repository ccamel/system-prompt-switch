import type { UIPort } from "../ports/ui.port";

export interface PiUIHost {
	hasUI: boolean;
	ui: {
		select(title: string, options: string[]): Promise<string | undefined>;
		input(title: string, placeholder?: string): Promise<string | undefined>;
		editor(title: string, prefill?: string): Promise<string | undefined>;
		confirm(title: string, message: string): Promise<boolean>;
		notify(message: string, type?: "info" | "warning" | "error"): void;
		setStatus(key: string, text: string | undefined): void;
	};
}

export class PiUIAdapter implements UIPort {
	private host: PiUIHost | null = null;
	private readonly statusKey = "system-prompt-switch";

	setHost(host: PiUIHost | null): void {
		this.host = host;
	}

	hasUI(): boolean {
		return Boolean(this.host?.hasUI);
	}

	async select(title: string, options: string[]): Promise<string | undefined> {
		if (!this.host?.hasUI) return undefined;
		return this.host.ui.select(title, options);
	}

	async input(title: string, placeholder?: string): Promise<string | undefined> {
		if (!this.host?.hasUI) return undefined;
		return this.host.ui.input(title, placeholder);
	}

	async editor(title: string, prefill?: string): Promise<string | undefined> {
		if (!this.host?.hasUI) return undefined;
		return this.host.ui.editor(title, prefill);
	}

	async confirm(title: string, message: string): Promise<boolean> {
		if (!this.host?.hasUI) return false;
		return this.host.ui.confirm(title, message);
	}

	notify(message: string, type: "info" | "warning" | "error" = "info"): void {
		if (this.host?.hasUI) {
			this.host.ui.notify(message, type);
		}
	}

	setStatus(text: string | undefined): void {
		if (this.host?.hasUI) {
			this.host.ui.setStatus(this.statusKey, text);
		}
	}
}
