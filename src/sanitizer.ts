// ============================================================
// PII 脱敏引擎
// ============================================================
import type { SanitizerRule, SanitizeOutput } from "./types";

export class Sanitizer {
  private compiledRules: Array<{ rule: SanitizerRule; regex: RegExp }> = [];

  /** 编译一批脱敏规则 */
  compile(rules: SanitizerRule[]): void {
    this.compiledRules = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      try {
        const regex = new RegExp(rule.regex, "g");
        this.compiledRules.push({ rule, regex });
      } catch {
        console.warn(
          `[Sanitizer] 无法编译规则 "${rule.name}": ${rule.regex}`,
        );
      }
    }
  }

  /**
   * 对文本执行脱敏。
   * @returns 脱敏后的文本和命中次数
   */
  sanitize(text: string): SanitizeOutput {
    let sanitized = text;
    let count = 0;

    for (const { rule, regex } of this.compiledRules) {
      // 重置 lastIndex
      regex.lastIndex = 0;

      let matches = 0;
      sanitized = sanitized.replace(regex, () => {
        matches++;
        return rule.replacement;
      });
      count += matches;
    }

    return { sanitized, count };
  }

  /**
   * 便捷方法：编译并脱敏
   */
  static sanitizeWithRules(
    text: string,
    rules: SanitizerRule[],
  ): SanitizeOutput {
    const s = new Sanitizer();
    s.compile(rules);
    return s.sanitize(text);
  }
}
