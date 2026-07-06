import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";

const textContent = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) return "";
			const record = item as Record<string, unknown>;
			return record.type === "text" && typeof record.text === "string" ? record.text : "";
		})
		.filter(Boolean)
		.join("\n");
};

const getPiInvocation = (args: string[]): { command: string; args: string[] } => {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };

	return { command: "pi", args };
};

export type ChildPiUpdate = (state: { finalOutput: string; stderr: string }) => void;

export type ChildPiResult = {
	exitCode: number;
	finalOutput: string;
	stderr: string;
	timedOut: boolean;
	aborted: boolean;
};

export async function runChildPi(options: {
	cwd: string;
	args: string[];
	timeoutMs: number;
	signal?: AbortSignal;
	onUpdate?: ChildPiUpdate;
}): Promise<ChildPiResult> {
	let finalOutput = "";
	let progressText = "";
	let stderr = "";
	let aborted = false;
	let timedOut = false;

	const exitCode = await new Promise<number>((resolve) => {
		const invocation = getPiInvocation(options.args);
		const proc = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				PI_SKIP_VERSION_CHECK: "1",
			},
		});
		let buffer = "";

		const emit = () => options.onUpdate?.({ finalOutput: finalOutput || progressText, stderr });

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: unknown;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}
			if (!event || typeof event !== "object" || Array.isArray(event)) return;
			const record = event as Record<string, unknown>;
			const type = typeof record.type === "string" ? record.type : "";
			if (type.includes("tool")) {
				const name = typeof record.toolName === "string" ? record.toolName
					: typeof record.name === "string" ? record.name
						: typeof record.tool === "object" && record.tool && "name" in record.tool ? String((record.tool as Record<string, unknown>).name)
							: "tool";
				progressText = `Delegate ${type.replace(/_/g, " ")}: ${name}`;
				emit();
				return;
			}
			if (type === "message_start" || type === "turn_start") {
				progressText = "Delegate thinking...";
				emit();
				return;
			}
			if (record.type !== "message_end") return;
			const message = record.message;
			if (!message || typeof message !== "object" || Array.isArray(message)) return;
			const msg = message as Record<string, unknown>;
			if (msg.role !== "assistant") return;
			const text = textContent(msg.content).trim();
			if (text) {
				finalOutput = text;
				emit();
			}
		};

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		let closed = false;
		const killProc = () => {
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!closed) proc.kill("SIGKILL");
			}, 5000);
		};

		const timeout = setTimeout(() => {
			timedOut = true;
			killProc();
		}, options.timeoutMs);

		proc.on("close", (code) => {
			closed = true;
			clearTimeout(timeout);
			if (buffer.trim()) processLine(buffer);
			resolve(code ?? 0);
		});

		proc.on("error", (error) => {
			clearTimeout(timeout);
			stderr += error.message;
			resolve(1);
		});

		if (options.signal) {
			const abortProc = () => {
				aborted = true;
				killProc();
			};
			if (options.signal.aborted) abortProc();
			else options.signal.addEventListener("abort", abortProc, { once: true });
		}
	});

	return { exitCode, finalOutput, stderr, timedOut, aborted };
}
