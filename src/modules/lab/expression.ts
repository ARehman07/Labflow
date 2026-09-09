/**
 * A tiny, safe arithmetic expression evaluator (no `eval`, no `Function`).
 * Supports: numbers, variables ([A-Za-z_][A-Za-z0-9_]*), + - * /, unary minus,
 * and parentheses. Used by the calculation engine to evaluate lab formulas such
 * as "TCHOL - HDL - (TG / 5)". Everything is parsed to tokens → RPN (shunting
 * yard) → evaluated with a supplied variable map, so only arithmetic can ever run.
 */

type Token =
  | { t: 'num'; v: number }
  | { t: 'var'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | 'u-' }
  | { t: 'lp' }
  | { t: 'rp' };

const PRECEDENCE: Record<string, number> = { 'u-': 4, '*': 3, '/': 3, '+': 2, '-': 2 };
const RIGHT_ASSOC = new Set(['u-']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(input[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < input.length && (isDigit(input[j]) || input[j] === '.')) j++;
      const num = Number(input.slice(i, j));
      if (Number.isNaN(num)) throw new Error(`Invalid number in formula near "${input.slice(i, j)}"`);
      tokens.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < input.length && isIdent(input[j])) j++;
      tokens.push({ t: 'var', v: input.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '(') {
      tokens.push({ t: 'lp' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ t: 'rp' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      // Decide unary minus: at start, or after another op / '('.
      const prev = tokens[tokens.length - 1];
      const isUnary =
        c === '-' && (!prev || prev.t === 'op' || prev.t === 'lp');
      tokens.push({ t: 'op', v: isUnary ? 'u-' : (c as '+' | '-' | '*' | '/') });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}" in formula`);
  }
  return tokens;
}

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const stack: Token[] = [];
  for (const tok of tokens) {
    if (tok.t === 'num' || tok.t === 'var') {
      output.push(tok);
    } else if (tok.t === 'op') {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t !== 'op') break;
        const higher =
          PRECEDENCE[top.v] > PRECEDENCE[tok.v] ||
          (PRECEDENCE[top.v] === PRECEDENCE[tok.v] && !RIGHT_ASSOC.has(tok.v));
        if (!higher) break;
        output.push(stack.pop() as Token);
      }
      stack.push(tok);
    } else if (tok.t === 'lp') {
      stack.push(tok);
    } else if (tok.t === 'rp') {
      let matched = false;
      while (stack.length) {
        const top = stack.pop() as Token;
        if (top.t === 'lp') {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) throw new Error('Mismatched parentheses in formula');
    }
  }
  while (stack.length) {
    const top = stack.pop() as Token;
    if (top.t === 'lp' || top.t === 'rp') throw new Error('Mismatched parentheses in formula');
    output.push(top);
  }
  return output;
}

/**
 * Evaluate `expression` using the given variable values.
 * Throws if a variable is missing or the expression is malformed.
 */
export function evaluateExpression(expression: string, vars: Record<string, number>): number {
  const rpn = toRpn(tokenize(expression));
  const stack: number[] = [];

  for (const tok of rpn) {
    if (tok.t === 'num') {
      stack.push(tok.v);
    } else if (tok.t === 'var') {
      const val = vars[tok.v];
      if (val === undefined || val === null || Number.isNaN(val)) {
        throw new Error(`Missing value for "${tok.v}"`);
      }
      stack.push(val);
    } else if (tok.t === 'op') {
      if (tok.v === 'u-') {
        const a = stack.pop();
        if (a === undefined) throw new Error('Malformed formula');
        stack.push(-a);
      } else {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) throw new Error('Malformed formula');
        switch (tok.v) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            if (b === 0) throw new Error('Division by zero in formula');
            stack.push(a / b);
            break;
        }
      }
    }
  }

  if (stack.length !== 1) throw new Error('Malformed formula');
  return stack[0];
}
