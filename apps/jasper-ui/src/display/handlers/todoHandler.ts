import { ToolDisplayHandler, DisplayContext, DisplayResult } from '../types.js';

export class TodoDisplayHandler implements ToolDisplayHandler {
  toolName = 'todo_ops';

  canHandle(context: DisplayContext): boolean {
    return context.toolName === 'todo_ops';
  }

  formatResult(context: DisplayContext): DisplayResult {
    if (!context.result.success) {
      return this.handleErrorResult(context);
    }

    const operation = context.parameters.operation;

    switch (operation) {
      case 'create':
        return this.formatCreateTodo(context);
      case 'create_batch':
        return this.formatCreateBatchTodos(context);
      case 'update_status':
        return this.formatUpdateTodoStatus(context);
      case 'list':
        return this.formatListTodos(context);
      case 'stats':
        return this.formatTodoStats(context);
      case 'update':
        return this.formatUpdateTodo(context);
      case 'delete':
        return this.formatDeleteTodo(context);
      case 'search':
        return this.formatSearchTodos(context);
      case 'clear_completed':
        return this.formatClearCompleted(context);
      default:
        return this.formatGenericTodoResult(context);
    }
  }

  private formatCreateTodo(context: DisplayContext): DisplayResult {
    // Try both result.result and direct result access
    const result = context.result.result || context.result;
    const { todo } = result || {};
    if (!todo) {
      return { content: 'Todo created successfully' };
    }

    const priority = this.formatPriority(todo.priority);
    const tags = todo.tags && todo.tags.length > 0 ? ` [${todo.tags.join(', ')}]` : '';

    let content = `✅ Created todo: ${todo.title}${tags}\n`;
    content += `   Status: ${this.formatStatus(todo.status)} | Priority: ${priority} | ID: ${todo.id}`;

    if (todo.description) {
      content += `\n   Description: ${todo.description}`;
    }

    return {
      content,
      shouldCollapse: false
    };
  }

  private formatCreateBatchTodos(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { todos = [], count } = result || {};

    if (todos.length === 0) {
      return { content: 'No todos created' };
    }

    let content = `✅ Created ${count || todos.length} todos:\n\n`;

    todos.forEach((todo: any, index: number) => {
      const priority = this.formatPriority(todo.priority);
      const tags = todo.tags && todo.tags.length > 0 ? ` [${todo.tags.join(', ')}]` : '';

      content += `${index + 1}. ${todo.title}${tags}\n`;
      content += `   Status: ${this.formatStatus(todo.status)} | Priority: ${priority} | ID: ${todo.id}`;

      if (todo.description) {
        content += `\n   Description: ${todo.description}`;
      }

      content += '\n';
      if (index < todos.length - 1) {
        content += '\n';
      }
    });

    return {
      content: content.trim(),
      shouldCollapse: false
    };
  }

  private formatUpdateTodoStatus(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { todo } = result || {};
    if (!todo) {
      return { content: 'Todo status updated successfully' };
    }

    const statusIcon = this.getStatusIcon(todo.status);
    let content = `${statusIcon} Updated todo: ${todo.title}\n`;
    content += `   Status: ${this.formatStatus(todo.status)}`;

    if (todo.status === 'completed' && todo.completedAt) {
      const completedTime = new Date(todo.completedAt).toLocaleTimeString();
      content += ` (completed at ${completedTime})`;
    }

    return {
      content,
      shouldCollapse: false
    };
  }

  private formatListTodos(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { todos = [] } = result || {};

    if (todos.length === 0) {
      return {
        content: '📋 No todos found',
        shouldCollapse: false
      };
    }

    let content = `📋 Todo List (${todos.length} ${todos.length === 1 ? 'item' : 'items'})\n\n`;

    // Group by status
    const pending = todos.filter((t: any) => t.status === 'pending');
    const inProgress = todos.filter((t: any) => t.status === 'in_progress');
    const completed = todos.filter((t: any) => t.status === 'completed');

    if (inProgress.length > 0) {
      content += '⏳ IN PROGRESS:\n';
      inProgress.forEach((todo: any) => {
        content += this.formatTodoLine(todo) + '\n';
      });
      content += '\n';
    }

    if (pending.length > 0) {
      content += '⏸️  PENDING:\n';
      pending.forEach((todo: any) => {
        content += this.formatTodoLine(todo) + '\n';
      });
      content += '\n';
    }

    if (completed.length > 0) {
      content += '✅ COMPLETED:\n';
      completed.forEach((todo: any) => {
        content += this.formatTodoLine(todo) + '\n';
      });
    }

    return {
      content: content.trim(),
      shouldCollapse: false // User requested not to collapse todos
    };
  }

  private formatTodoStats(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { stats } = result || {};
    if (!stats) {
      return { content: 'No todo statistics available' };
    }

    let content = `📊 Todo Statistics\n\n`;
    content += `Total Todos: ${stats.total}\n`;
    content += `Pending: ${stats.pending}\n`;
    content += `In Progress: ${stats.inProgress}\n`;
    content += `Completed: ${stats.completed}\n`;
    content += `Completion Rate: ${stats.completionRate}%\n\n`;

    // Add visual progress bar
    if (stats.total > 0) {
      const progressPercent = Math.round(stats.completionRate);
      const progressBars = Math.round(progressPercent / 5); // 20 bars for 100%
      const emptyBars = 20 - progressBars;
      const progressBar = '█'.repeat(progressBars) + '░'.repeat(emptyBars);
      content += `Progress: [${progressBar}] ${progressPercent}%`;
    }

    return {
      content,
      shouldCollapse: false
    };
  }

  private formatUpdateTodo(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { todo } = result || {};
    if (!todo) {
      return { content: 'Todo updated successfully' };
    }

    const priority = this.formatPriority(todo.priority);
    const tags = todo.tags && todo.tags.length > 0 ? ` [${todo.tags.join(', ')}]` : '';

    let content = `✏️  Updated todo: ${todo.title}${tags}\n`;
    content += `   Status: ${this.formatStatus(todo.status)} | Priority: ${priority}`;

    if (todo.description) {
      content += `\n   Description: ${todo.description}`;
    }

    return {
      content,
      shouldCollapse: false
    };
  }

  private formatDeleteTodo(context: DisplayContext): DisplayResult {
    const message = context.result.result?.message || 'Todo deleted successfully';
    return {
      content: `🗑️  ${message}`,
      shouldCollapse: false
    };
  }

  private formatSearchTodos(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { todos = [], query } = result || {};

    let content = `🔍 Search results for "${query}" (${todos.length} ${todos.length === 1 ? 'result' : 'results'})\n\n`;

    if (todos.length === 0) {
      content += 'No todos found matching your search criteria.';
    } else {
      todos.forEach((todo: any) => {
        content += this.formatTodoLine(todo) + '\n';
      });
    }

    return {
      content: content.trim(),
      shouldCollapse: false
    };
  }

  private formatClearCompleted(context: DisplayContext): DisplayResult {
    const result = context.result.result || context.result;
    const { clearedCount } = result || {};
    const message = context.result.result?.message || `Cleared ${clearedCount || 0} completed todos`;

    return {
      content: `🧹 ${message}`,
      shouldCollapse: false
    };
  }

  private formatGenericTodoResult(context: DisplayContext): DisplayResult {
    const result = context.result.result;
    if (typeof result === 'object' && result.message) {
      return {
        content: `📝 ${result.message}`,
        shouldCollapse: false
      };
    }

    return {
      content: JSON.stringify(result, null, 2),
      shouldCollapse: false
    };
  }

  private handleErrorResult(context: DisplayContext): DisplayResult {
    const error = context.result.error || 'Unknown error occurred';
    return {
      content: `❌ Todo operation failed: ${error}`,
      shouldCollapse: false
    };
  }

  private formatTodoLine(todo: any): string {
    const statusIcon = this.getStatusIcon(todo.status);
    const priority = this.formatPriority(todo.priority);
    const tags = todo.tags && todo.tags.length > 0 ? ` [${todo.tags.join(', ')}]` : '';

    let line = `${statusIcon} `;

    // Strike through completed todos as requested
    if (todo.status === 'completed') {
      line += `~~${todo.title}~~`;
    } else {
      line += todo.title;
    }

    line += `${tags} (${priority})`;

    if (todo.description) {
      line += ` - ${todo.description}`;
    }

    return line;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return '⏸️ ';
      case 'in_progress': return '⏳';
      case 'completed': return '✅';
      default: return '📝';
    }
  }

  private formatStatus(status: string): string {
    switch (status) {
      case 'pending': return 'Pending';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      default: return status;
    }
  }

  private formatPriority(priority: string): string {
    switch (priority) {
      case 'high': return '🔴 High';
      case 'medium': return '🟡 Medium';
      case 'low': return '🟢 Low';
      default: return priority || 'Medium';
    }
  }

  getSummary(context: DisplayContext): string {
    const operation = context.parameters.operation;

    switch (operation) {
      case 'create':
        const { todo } = context.result.result || {};
        return todo ? `Created: ${todo.title}` : 'Todo created';
      case 'create_batch':
        const { todos: batchTodos, count } = context.result.result || {};
        return `Created ${count || batchTodos?.length || 0} todos`;
      case 'update_status':
        const { todo: updatedTodo } = context.result.result || {};
        return updatedTodo ? `Status updated: ${updatedTodo.title}` : 'Status updated';
      case 'list':
        const { todos } = context.result.result || {};
        return `Listed ${todos?.length || 0} todos`;
      case 'stats':
        const { stats } = context.result.result || {};
        return stats ? `Stats: ${stats.completed}/${stats.total} completed` : 'Todo statistics';
      case 'search':
        const { todos: searchTodos, query } = context.result.result || {};
        return `Search "${query}": ${searchTodos?.length || 0} results`;
      default:
        return `Todo ${operation}`;
    }
  }

  shouldCollapse(context: DisplayContext): boolean {
    // User specifically requested not to collapse todos
    return false;
  }
}