import { describe, expect, it } from "vitest";
import { extractLaunchPathArguments } from "./startupOpen";

describe("startup open argv parsing", () => {
  it("extracts packaged launch path arguments after the executable path", () => {
    expect(
      extractLaunchPathArguments(["SuwolView.exe", "C:\\Images\\a.png", "C:\\Images\\b.jpg"], {
        isPackaged: true,
        execPath: "SuwolView.exe"
      })
    ).toEqual(["C:\\Images\\a.png", "C:\\Images\\b.jpg"]);
  });

  it("ignores dev runtime arguments and Vite URLs", () => {
    expect(
      extractLaunchPathArguments(
        [
          "electron.exe",
          ".",
          "--inspect=9229",
          "--remote-debugging-port",
          "9222",
          "http://127.0.0.1:5173",
          "C:\\Images\\a.png"
        ],
        {
          isPackaged: false,
          appPath: process.cwd(),
          execPath: "electron.exe"
        }
      )
    ).toEqual(["C:\\Images\\a.png"]);
  });

  it("allows launch paths after an argv terminator", () => {
    expect(
      extractLaunchPathArguments(["SuwolView.exe", "--", "C:\\Images", "C:\\Comics\\book.cbz"], {
        isPackaged: true
      })
    ).toEqual(["C:\\Images", "C:\\Comics\\book.cbz"]);
  });

  it("does not treat URL-like values as local launch paths", () => {
    expect(
      extractLaunchPathArguments(["SuwolView.exe", "https://example.test/a.png", "file:///C:/Images/a.png"], {
        isPackaged: true
      })
    ).toEqual([]);
  });
});
