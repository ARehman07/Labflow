/**
 * Server messages that carry a name or number, so they cannot be matched as
 * whole sentences. Each pattern captures the variable parts and names the key
 * whose translation they are placed back into.
 */
export const MESSAGE_PATTERNS: { re: RegExp; key: string; vars: string[] }[] = [
  { re: /^The username "(.+)" is already taken\.$/, key: 'err.usernameTaken', vars: ['name'] },
  { re: /^A role called "(.+)" already exists\.$/, key: 'err.roleExists', vars: ['name'] },
  { re: /^"(.+)" is a custom role and has no defaults\.$/, key: 'err.customRoleNoDefaults', vars: ['name'] },
  { re: /^(.+) cannot be deleted\.$/, key: 'err.roleCannotDelete', vars: ['name'] },
  { re: /^(\d+) users? still uses? this role\. Move them to another role first\.$/, key: 'err.roleInUse', vars: ['n'] },
  { re: /^A parameter that already has results cannot be removed: (.+)\.$/, key: 'err.paramInUse', vars: ['names'] },
  { re: /^Cannot approve: (.+) (?:has|have) no value\. Open the result, check the inputs and save again\.$/, key: 'err.cannotApproveBlank', vars: ['names'] },
  { re: /^Unexpected character "(.+)" in formula$/, key: 'err.formulaChar', vars: ['x'] },
  { re: /^Missing value for "(.+)"$/, key: 'err.formulaMissing', vars: ['x'] },
  { re: /^Invalid number in formula near "(.+)"$/, key: 'err.formulaNumber', vars: ['x'] },
];
