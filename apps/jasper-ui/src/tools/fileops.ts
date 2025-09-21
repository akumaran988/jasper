import fs from 'fs';
import path from 'path';
import { Tool } from '../types/index.js';

export class FileOperationsTool implements Tool {
  name = 'file_ops';
  description = 'File operations: create, read, update files with diff-style output. Use operation parameter to specify action (create/read/read_lines/list_dir/update/update_lines) and file_path for the target file.';
  parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'read', 'read_lines', 'list_dir', 'update', 'update_lines'],
        description: 'File operation to perform'
      },
      file_path: {
        type: 'string',
        description: 'Path to the file (required for all operations except list_dir when used with dir_path)'
      },
      dir_path: {
        type: 'string',
        description: 'Directory path (for list_dir operation)'
      },
      content: {
        type: 'string',
        description: 'File content (for create and update operations)'
      },
      start_line: {
        type: 'number',
        description: 'Starting line number for read_lines or update_lines operations (1-based)'
      },
      end_line: {
        type: 'number',
        description: 'Ending line number for read_lines or update_lines operations (1-based, inclusive)'
      },
      new_content: {
        type: 'string',
        description: 'New content for specific lines (for update_lines operation)'
      }
    },
    required: ['operation'],
    anyOf: [
      { required: ['file_path'] },
      { required: ['dir_path'] }
    ]
  };

  private formatDiff(originalLines: string[], newLines: string[], filePath: string): string {
    const result: string[] = [];
    result.push(`--- a/${filePath}`);
    result.push(`+++ b/${filePath}`);
    
    let i = 0, j = 0;
    let hunkStart = 0;
    let hunkLines: string[] = [];
    
    while (i < originalLines.length || j < newLines.length) {
      if (i < originalLines.length && j < newLines.length && originalLines[i] === newLines[j]) {
        // Lines match
        if (hunkLines.length > 0) {
          hunkLines.push(` ${originalLines[i]}`);
        }
        i++;
        j++;
      } else {
        // Lines differ - start a hunk if we haven't
        if (hunkLines.length === 0) {
          hunkStart = Math.max(0, i - 3); // Context lines
          
          // Add context before the change
          for (let k = hunkStart; k < i; k++) {
            hunkLines.push(` ${originalLines[k]}`);
          }
        }
        
        // Add removed lines
        while (i < originalLines.length && (j >= newLines.length || originalLines[i] !== newLines[j])) {
          hunkLines.push(`-${originalLines[i]}`);
          i++;
        }
        
        // Add added lines
        while (j < newLines.length && (i >= originalLines.length || originalLines[i] !== newLines[j])) {
          hunkLines.push(`+${newLines[j]}`);
          j++;
        }
        
        // Add context after the change and finalize hunk
        let contextAdded = 0;
        while (i < originalLines.length && j < newLines.length && 
               originalLines[i] === newLines[j] && contextAdded < 3) {
          hunkLines.push(` ${originalLines[i]}`);
          i++;
          j++;
          contextAdded++;
        }
        
        // Output the hunk
        const originalCount = i - hunkStart;
        const newCount = hunkLines.filter(l => !l.startsWith('-')).length;
        result.push(`@@ -${hunkStart + 1},${originalCount} +${hunkStart + 1},${newCount} @@`);
        result.push(...hunkLines);
        
        hunkLines = [];
      }
    }
    
    return result.join('\n');
  }

  private formatFileContent(lines: string[], startLine?: number, endLine?: number): string {
    const start = Math.max(1, startLine || 1);
    const end = Math.min(lines.length, endLine || lines.length);
    
    const result: string[] = [];
    for (let i = start - 1; i < end; i++) {
      result.push(`${String(i + 1).padStart(4, ' ')} ${lines[i]}`);
    }
    
    return result.join('\n');
  }

  async execute(params: Record<string, any>): Promise<any> {
    const { operation, file_path, dir_path, content, start_line, end_line, new_content } = params;
    const targetPath = file_path || dir_path;
    
    if (!operation) {
      throw new Error('operation parameter is required. Must be one of: create, read, read_lines, list_dir, update, update_lines');
    }

    try {
      switch (operation) {
        case 'create': {
          if (!file_path || !content) {
            throw new Error('file_path and content are required for create operation');
          }
          
          // Check if file already exists
          if (fs.existsSync(file_path)) {
            throw new Error(`File already exists: ${file_path}`);
          }
          
          // Create directory if it doesn't exist
          const dir = path.dirname(file_path);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          fs.writeFileSync(file_path, content, 'utf-8');
          const lines = content.split('\n');
          
          return {
            success: true,
            result: {
              message: `Created file: ${file_path}`,
              lines_added: lines.length,
              content: this.formatFileContent(lines)
            }
          };
        }

        case 'read': {
          if (!file_path) {
            throw new Error('file_path is required for read operation');
          }
          
          if (!fs.existsSync(file_path)) {
            throw new Error(`File not found: ${file_path}`);
          }
          
          const fileContent = fs.readFileSync(file_path, 'utf-8');
          const lines = fileContent.split('\n');
          
          return {
            success: true,
            result: {
              file_path,
              total_lines: lines.length,
              content: this.formatFileContent(lines)
            }
          };
        }

        case 'read_lines': {
          if (!file_path || !start_line) {
            throw new Error('file_path and start_line are required for read_lines operation');
          }
          
          if (!fs.existsSync(file_path)) {
            throw new Error(`File not found: ${file_path}`);
          }
          
          const fileContent = fs.readFileSync(file_path, 'utf-8');
          const lines = fileContent.split('\n');
          
          const actualEndLine = end_line || start_line;
          if (start_line < 1 || actualEndLine > lines.length || start_line > actualEndLine) {
            throw new Error(`Invalid line range: ${start_line}-${actualEndLine} (file has ${lines.length} lines)`);
          }
          
          return {
            success: true,
            result: {
              file_path,
              line_range: `${start_line}-${actualEndLine}`,
              total_lines: lines.length,
              content: this.formatFileContent(lines, start_line, actualEndLine)
            }
          };
        }

        case 'list_dir': {
          const targetDir = dir_path || path.dirname(file_path || '.');
          
          if (!fs.existsSync(targetDir)) {
            throw new Error(`Directory not found: ${targetDir}`);
          }
          
          const stats = fs.statSync(targetDir);
          if (!stats.isDirectory()) {
            throw new Error(`Not a directory: ${targetDir}`);
          }
          
          const items = fs.readdirSync(targetDir);
          const detailed = items.map(item => {
            const itemPath = path.join(targetDir, item);
            const itemStats = fs.statSync(itemPath);
            
            return {
              name: item,
              type: itemStats.isDirectory() ? 'directory' : 'file',
              size: itemStats.isFile() ? itemStats.size : undefined,
              modified: itemStats.mtime.toISOString()
            };
          });
          
          return {
            success: true,
            result: {
              directory: path.resolve(targetDir),
              total_items: items.length,
              items: detailed
            }
          };
        }

        case 'update': {
          if (!file_path || !content) {
            throw new Error('file_path and content are required for update operation');
          }
          
          if (!fs.existsSync(file_path)) {
            throw new Error(`File not found: ${file_path}`);
          }
          
          const originalContent = fs.readFileSync(file_path, 'utf-8');
          const originalLines = originalContent.split('\n');
          const newLines = content.split('\n');
          
          fs.writeFileSync(file_path, content, 'utf-8');
          
          const diff = this.formatDiff(originalLines, newLines, path.basename(file_path));
          
          return {
            success: true,
            result: {
              message: `Updated file: ${file_path}`,
              lines_changed: Math.abs(newLines.length - originalLines.length),
              diff: diff
            }
          };
        }

        case 'update_lines': {
          if (!file_path || !start_line || !new_content) {
            throw new Error('file_path, start_line, and new_content are required for update_lines operation');
          }
          
          if (!fs.existsSync(file_path)) {
            throw new Error(`File not found: ${file_path}`);
          }
          
          const originalContent = fs.readFileSync(file_path, 'utf-8');
          const originalLines = originalContent.split('\n');
          
          const actualEndLine = end_line || start_line;
          if (start_line < 1 || actualEndLine > originalLines.length || start_line > actualEndLine) {
            throw new Error(`Invalid line range: ${start_line}-${actualEndLine} (file has ${originalLines.length} lines)`);
          }
          
          const newContentLines = new_content.split('\n');
          const updatedLines = [
            ...originalLines.slice(0, start_line - 1),
            ...newContentLines,
            ...originalLines.slice(actualEndLine)
          ];
          
          const newContent = updatedLines.join('\n');
          fs.writeFileSync(file_path, newContent, 'utf-8');
          
          const diff = this.formatDiff(originalLines, updatedLines, path.basename(file_path));
          
          return {
            success: true,
            result: {
              message: `Updated lines ${start_line}-${actualEndLine} in: ${file_path}`,
              original_lines: actualEndLine - start_line + 1,
              new_lines: newContentLines.length,
              diff: diff
            }
          };
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export const fileOpsTool = new FileOperationsTool();