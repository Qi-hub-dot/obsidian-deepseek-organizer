// ============================================================
// 脱敏引擎单元测试
// ============================================================
import { Sanitizer } from "./sanitizer";
import type { SanitizerRule } from "./types";

const defaultRules: SanitizerRule[] = [
  { id: "phone", name: "手机号", regex: "1[3-9]\\d{9}", replacement: "[手机号]", enabled: true },
  { id: "idcard", name: "身份证号", regex: "\\d{17}[\\dXx]", replacement: "[身份证号]", enabled: true },
  { id: "email", name: "邮箱", regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", replacement: "[邮箱]", enabled: true },
  { id: "ip", name: "IP 地址", regex: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", replacement: "[IP地址]", enabled: true },
];

describe("Sanitizer", () => {
  test("不包含敏感信息的文本原样返回", () => {
    const result = Sanitizer.sanitizeWithRules("这是一段普通的笔记内容。", defaultRules);
    expect(result.sanitized).toBe("这是一段普通的笔记内容。");
    expect(result.count).toBe(0);
  });

  test("手机号被正确脱敏", () => {
    const result = Sanitizer.sanitizeWithRules(
      "请联系我 13812345678 或 15987654321。",
      defaultRules,
    );
    expect(result.sanitized).not.toContain("13812345678");
    expect(result.sanitized).not.toContain("15987654321");
    expect(result.sanitized).toContain("[手机号]");
    expect(result.count).toBe(2);
  });

  test("身份证号被正确脱敏", () => {
    const result = Sanitizer.sanitizeWithRules(
      "身份证号：11010119900307775X",
      defaultRules,
    );
    expect(result.sanitized).not.toContain("11010119900307775X");
    expect(result.sanitized).toContain("[身份证号]");
    expect(result.count).toBe(1);
  });

  test("邮箱被正确脱敏", () => {
    const result = Sanitizer.sanitizeWithRules(
      "邮箱：user@example.com",
      defaultRules,
    );
    expect(result.sanitized).not.toContain("user@example.com");
    expect(result.sanitized).toContain("[邮箱]");
    expect(result.count).toBe(1);
  });

  test("IP 地址被正确脱敏", () => {
    const result = Sanitizer.sanitizeWithRules(
      "服务器地址：192.168.1.1",
      defaultRules,
    );
    expect(result.sanitized).not.toContain("192.168.1.1");
    expect(result.sanitized).toContain("[IP地址]");
    expect(result.count).toBe(1);
  });

  test("关闭规则后不脱敏", () => {
    const rules: SanitizerRule[] = [
      { id: "phone", name: "手机号", regex: "1[3-9]\\d{9}", replacement: "[手机号]", enabled: false },
    ];
    const result = Sanitizer.sanitizeWithRules("手机号 13812345678", rules);
    expect(result.sanitized).toContain("13812345678");
    expect(result.count).toBe(0);
  });

  test("多规则同时命中", () => {
    const result = Sanitizer.sanitizeWithRules(
      "用户信息：13812345678 user@example.com",
      defaultRules,
    );
    expect(result.count).toBe(2);
    expect(result.sanitized).toContain("[手机号]");
    expect(result.sanitized).toContain("[邮箱]");
  });

  test("非法正则被忽略", () => {
    const rules: SanitizerRule[] = [
      { id: "bad", name: "坏规则", regex: "[[[invalid", replacement: "X", enabled: true },
    ];
    // 不应抛出异常
    expect(() => Sanitizer.sanitizeWithRules("test", rules)).not.toThrow();
  });

  test("空输入不报错", () => {
    const result = Sanitizer.sanitizeWithRules("", defaultRules);
    expect(result.sanitized).toBe("");
    expect(result.count).toBe(0);
  });

  test("Sanitizer 实例可复用", () => {
    const s = new Sanitizer();
    s.compile(defaultRules);
    const r1 = s.sanitize("13812345678");
    const r2 = s.sanitize("15987654321");
    expect(r1.count).toBe(1);
    expect(r2.count).toBe(1);
  });
});
