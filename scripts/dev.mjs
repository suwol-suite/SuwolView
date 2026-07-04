import { spawn } from "node:child_process";
import http from "node:http";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const devServerUrl = "http://127.0.0.1:5173";

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(check, 250);
        }
      });
    };
    check();
  });
}

await run(npmCommand, ["run", "build:main"]);

const vite = spawnProcess(npmCommand, ["exec", "vite", "--", "--host", "127.0.0.1", "--port", "5173"]);

try {
  await waitForServer(devServerUrl);
} catch (error) {
  vite.kill();
  throw error;
}

const electron = spawnProcess(npmCommand, ["exec", "electron", "."], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl
  }
});

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  electron.kill();
  vite.kill();
});
