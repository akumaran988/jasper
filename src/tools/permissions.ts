import { Tool } from '../types/index.js';
import { globalPermissionManager } from '../core/permissions.js';

export class PermissionsTool implements Tool {
  name = 'permissions';
  description = 'Manage tool execution permissions and security levels';
  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'set_level', 'list_commands', 'help'],
        description: 'Action to perform'
      },
      level: {
        type: 'string',
        enum: ['safe', 'developer', 'admin'],
        description: 'Permission level to set (for set_level action)'
      }
    },
    required: ['action']
  };

  async execute(params: Record<string, any>): Promise<any> {
    const { action, level } = params;

    switch (action) {
      case 'status':
        return {
          success: true,
          result: {
            current_level: globalPermissionManager.getCurrentLevel(),
            summary: globalPermissionManager.getPermissionSummary(),
            available_commands: globalPermissionManager.listAvailableCommands().slice(0, 10)
          }
        };

      case 'set_level':
        if (!level) {
          throw new Error('Level parameter required for set_level action');
        }
        
        const success = globalPermissionManager.setPermissionLevel(level);
        if (!success) {
          throw new Error(`Invalid permission level: ${level}`);
        }
        
        return {
          success: true,
          result: {
            message: `Permission level changed to ${level}`,
            new_level: globalPermissionManager.getCurrentLevel(),
            available_commands: globalPermissionManager.listAvailableCommands()
          }
        };

      case 'list_commands':
        return {
          success: true,
          result: {
            allowed_commands: globalPermissionManager.listAvailableCommands(),
            current_level: globalPermissionManager.getCurrentLevel().name,
            description: globalPermissionManager.getCurrentLevel().description
          }
        };

      case 'help':
        return {
          success: true,
          result: {
            message: 'Jasper Permission System',
            levels: {
              safe: 'Read-only operations, basic file viewing, no modifications',
              developer: 'Development tools, npm/yarn, git, file operations with confirmation',
              admin: 'Full system access with explicit approval for dangerous operations'
            },
            commands: {
              'permissions(action: "status")': 'Show current permission level and summary',
              'permissions(action: "set_level", level: "safe|developer|admin")': 'Change permission level',
              'permissions(action: "list_commands")': 'List allowed commands for current level',
              'permissions(action: "help")': 'Show this help message'
            }
          }
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

export const permissionsTool = new PermissionsTool();