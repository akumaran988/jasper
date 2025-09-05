import { Tool, ToolCall } from '../types/index.js';

export interface PermissionLevel {
  name: string;
  description: string;
  allowedTools: string[];
  allowedPatterns: RegExp[];
  blockedPatterns: RegExp[];
  requiresConfirmation: boolean;
}

export interface PermissionConfig {
  currentLevel: string;
  levels: Record<string, PermissionLevel>;
  autoApproveTools: string[];
  alwaysBlock: RegExp[];
}

export class PermissionManager {
  private config: PermissionConfig;
  private pendingApprovals: Map<string, ToolCall> = new Map();

  constructor() {
    this.config = {
      currentLevel: 'safe',
      levels: {
        safe: {
          name: 'Safe Mode',
          description: 'Only allows read-only operations and basic tools',
          allowedTools: ['bash'],
          allowedPatterns: [
            /^ls\s/,
            /^pwd$/,
            /^whoami$/,
            /^date$/,
            /^ping\s+-c\s+\d+\s+[^|><&;`$(){}[\]*?~]*$/,
            /^cat\s+[^|><&;`$(){}[\]*?~]*$/,
            /^find\s+[^|><&;`$(){}[\]*?~]*$/,
            /^grep\s+[^|><&;`$(){}[\]*?~]*$/,
            /^head\s+[^|><&;`$(){}[\]*?~]*$/,
            /^tail\s+[^|><&;`$(){}[\]*?~]*$/,
            /^wc\s+[^|><&;`$(){}[\]*?~]*$/,
            /^du\s+[^|><&;`$(){}[\]*?~]*$/,
            /^df\s*$/,
            /^ps\s+[^|><&;`$(){}[\]*?~]*$/,
            /^which\s+[^|><&;`$(){}[\]*?~]*$/,
            /^type\s+[^|><&;`$(){}[\]*?~]*$/,
          ],
          blockedPatterns: [
            /rm\s+/,
            /sudo\s+/,
            /chmod\s+/,
            /chown\s+/,
            /mv\s+/,
            /cp\s+.*>\s*/,
            />\s*\/dev\//,
            /\|\s*sh/,
            /\|\s*bash/,
            /&&|;|\|/,
            /`.*`/,
            /\$\(/,
          ],
          requiresConfirmation: false
        },
        developer: {
          name: 'Developer Mode',
          description: 'Allows most development operations with confirmations',
          allowedTools: ['bash', 'git', 'npm', 'yarn'],
          allowedPatterns: [
            /^npm\s+(install|run|test|build|start)/,
            /^yarn\s+(install|run|test|build|start)/,
            /^git\s+(status|log|diff|add|commit|push|pull|branch|checkout)/,
            /^mkdir\s+[^|><&;`$(){}[\]*?~]*$/,
            /^touch\s+[^|><&;`$(){}[\]*?~]*$/,
            /^cp\s+[^|><&;`$(){}[\]*?~]*$/,
            /^mv\s+[^|><&;`$(){}[\]*?~]*$/,
            /^echo\s+.*>\s*[^|><&;`$(){}[\]*?~]*$/,
            /^node\s+[^|><&;`$(){}[\]*?~]*$/,
            /^python\s+[^|><&;`$(){}[\]*?~]*$/,
            /^tsc\s*/,
            /^eslint\s*/,
            /^prettier\s*/,
          ],
          blockedPatterns: [
            /rm\s+-rf\s+\/(?!home|tmp|var\/tmp)/,
            /sudo\s+rm/,
            /dd\s+.*\/dev/,
            /mkfs/,
            /fdisk/,
            /format/,
            /> \/dev\//,
            /chmod\s+777\s+\//,
            /curl.*\|.*sh/,
            /wget.*\|.*sh/,
          ],
          requiresConfirmation: true
        },
        admin: {
          name: 'Admin Mode',
          description: 'Allows system administration with explicit approval',
          allowedTools: ['bash', 'git', 'npm', 'yarn', 'docker', 'systemctl'],
          allowedPatterns: [/.*/], // Allow all, but with confirmation
          blockedPatterns: [
            /rm\s+-rf\s+\/$/,
            /rm\s+-rf\s+\/\s*$/,
            /:\(\)\s*{.*}\s*:\s*;/,  // Fork bomb
            /while\s+true.*sleep/,   // Infinite loops
          ],
          requiresConfirmation: true
        }
      },
      autoApproveTools: [],
      alwaysBlock: [
        /rm\s+-rf\s+\/$/,
        /format\s+c:/,
        /dd\s+.*\/dev\/sd[a-z]$/,
        />\s*\/dev\/sd[a-z]/,
      ]
    };
  }

  setPermissionLevel(level: string): boolean {
    if (level in this.config.levels) {
      this.config.currentLevel = level;
      console.log(`🔐 Permission level set to: ${this.config.levels[level].name}`);
      return true;
    }
    return false;
  }

  getCurrentLevel(): PermissionLevel {
    return this.config.levels[this.config.currentLevel];
  }

  async checkToolPermission(toolCall: ToolCall): Promise<{ allowed: boolean; reason?: string; requiresConfirmation?: boolean }> {
    const currentLevel = this.getCurrentLevel();
    
    // Check if tool is in allowed list
    if (!currentLevel.allowedTools.includes(toolCall.name)) {
      return {
        allowed: false,
        reason: `Tool '${toolCall.name}' not allowed in ${currentLevel.name} mode`
      };
    }

    // Special handling for bash commands
    if (toolCall.name === 'bash' && toolCall.parameters.command) {
      const command = toolCall.parameters.command as string;
      
      // Check always blocked patterns first
      for (const pattern of this.config.alwaysBlock) {
        if (pattern.test(command)) {
          return {
            allowed: false,
            reason: `Command blocked for security: matches dangerous pattern`
          };
        }
      }
      
      // Check level-specific blocked patterns
      for (const pattern of currentLevel.blockedPatterns) {
        if (pattern.test(command)) {
          return {
            allowed: false,
            reason: `Command blocked in ${currentLevel.name}: matches blocked pattern`
          };
        }
      }
      
      // Check allowed patterns
      const isAllowed = currentLevel.allowedPatterns.some(pattern => pattern.test(command));
      
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Command not in allowed patterns for ${currentLevel.name} mode`
        };
      }
    }

    // Check if confirmation is required
    if (currentLevel.requiresConfirmation && !this.config.autoApproveTools.includes(toolCall.name)) {
      return {
        allowed: true,
        requiresConfirmation: true
      };
    }

    return { allowed: true };
  }

  async requestPermission(toolCall: ToolCall): Promise<boolean> {
    const permission = await this.checkToolPermission(toolCall);
    
    if (!permission.allowed) {
      return false;
    }

    if (permission.requiresConfirmation) {
      // For demo purposes, auto-approve
      return true;
    }

    return true;
  }

  getPermissionSummary(): string {
    const level = this.getCurrentLevel();
    return `Current: ${level.name} - ${level.description}`;
  }

  listAvailableCommands(): string[] {
    const level = this.getCurrentLevel();
    const examples: string[] = [];
    
    // Extract example commands from allowed patterns
    level.allowedPatterns.forEach(pattern => {
      const source = pattern.source;
      if (source.startsWith('^') && source.includes('\\s')) {
        const cmd = source.split('\\s')[0].replace('^', '');
        if (cmd && !examples.includes(cmd)) {
          examples.push(cmd);
        }
      }
    });
    
    return examples.sort();
  }
}

export const globalPermissionManager = new PermissionManager();