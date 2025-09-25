import { Tool } from '../types/index.js';

interface Todo {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  tags?: string[];
}

interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionRate: number;
}

class TodoManager {
  private todos: Map<string, Todo> = new Map();
  private nextId = 1;

  createTodo(
    title: string,
    description?: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    tags?: string[]
  ): Todo {
    const id = `todo_${this.nextId++}`;
    const now = new Date();

    const todo: Todo = {
      id,
      title,
      description,
      status: 'pending',
      priority,
      createdAt: now,
      updatedAt: now,
      tags: tags || []
    };

    this.todos.set(id, todo);
    return todo;
  }

  updateTodoStatus(id: string, status: 'pending' | 'in_progress' | 'completed'): Todo {
    const todo = this.todos.get(id);
    if (!todo) {
      throw new Error(`Todo with id '${id}' not found`);
    }

    todo.status = status;
    todo.updatedAt = new Date();

    if (status === 'completed' && !todo.completedAt) {
      todo.completedAt = new Date();
    } else if (status !== 'completed') {
      todo.completedAt = undefined;
    }

    this.todos.set(id, todo);
    return todo;
  }

  updateTodo(
    id: string,
    updates: {
      title?: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high';
      tags?: string[];
    }
  ): Todo {
    const todo = this.todos.get(id);
    if (!todo) {
      throw new Error(`Todo with id '${id}' not found`);
    }

    if (updates.title !== undefined) todo.title = updates.title;
    if (updates.description !== undefined) todo.description = updates.description;
    if (updates.priority !== undefined) todo.priority = updates.priority;
    if (updates.tags !== undefined) todo.tags = updates.tags;

    todo.updatedAt = new Date();
    this.todos.set(id, todo);
    return todo;
  }

  deleteTodo(id: string): boolean {
    return this.todos.delete(id);
  }

  getTodo(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  getAllTodos(): Todo[] {
    return Array.from(this.todos.values()).sort((a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  getTodosByStatus(status: 'pending' | 'in_progress' | 'completed'): Todo[] {
    return Array.from(this.todos.values())
      .filter(todo => todo.status === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getTodosByPriority(priority: 'low' | 'medium' | 'high'): Todo[] {
    return Array.from(this.todos.values())
      .filter(todo => todo.priority === priority)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  searchTodos(query: string): Todo[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.todos.values())
      .filter(todo =>
        todo.title.toLowerCase().includes(lowerQuery) ||
        (todo.description && todo.description.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getStats(): TodoStats {
    const all = Array.from(this.todos.values());
    const total = all.length;
    const pending = all.filter(t => t.status === 'pending').length;
    const inProgress = all.filter(t => t.status === 'in_progress').length;
    const completed = all.filter(t => t.status === 'completed').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      pending,
      inProgress,
      completed,
      completionRate: Math.round(completionRate * 100) / 100
    };
  }

  clearAllTodos(): void {
    this.todos.clear();
    this.nextId = 1;
  }

  clearCompletedTodos(): number {
    const completedIds: string[] = [];
    for (const [id, todo] of this.todos.entries()) {
      if (todo.status === 'completed') {
        completedIds.push(id);
      }
    }

    completedIds.forEach(id => this.todos.delete(id));
    return completedIds.length;
  }
}

// Global todo manager instance
const todoManager = new TodoManager();

export class TodoTool implements Tool {
  name = 'todo_ops';
  description = 'Todo operations for AI task planning. ALWAYS use for complex multi-step tasks. Use operation parameter to specify action (create/update_status/list/stats/update/delete/search/clear_completed) and required parameters for each operation.';
  parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'create_batch', 'update_status', 'list', 'stats', 'update', 'delete', 'search', 'clear_completed'],
        description: 'Todo operation to perform'
      },
      title: {
        type: 'string',
        description: 'Todo title (required for create operation)'
      },
      description: {
        type: 'string',
        description: 'Todo description (optional for create/update operations)'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Todo priority (optional for create/update operations)'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Todo tags (optional for create/update operations)'
      },
      id: {
        type: 'string',
        description: 'Todo ID (required for update_status/update/delete operations)'
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed'],
        description: 'New status (required for update_status operation)'
      },
      filter_status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed'],
        description: 'Filter todos by status (optional for list operation)'
      },
      filter_priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Filter todos by priority (optional for list operation)'
      },
      query: {
        type: 'string',
        description: 'Search query (required for search operation)'
      },
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Todo title' },
            description: { type: 'string', description: 'Todo description' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Todo priority' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Todo tags' }
          },
          required: ['title']
        },
        description: 'Array of todos to create (required for create_batch operation)'
      }
    },
    required: ['operation']
  };

  prompt = 'ALWAYS USE THIS for complex multi-step tasks. Create todos BEFORE starting work to track progress. Mark as "in_progress" when starting, "completed" when finished.';

  async execute(params: any): Promise<any> {
    try {
      switch (params.operation) {
        case 'create':
          if (!params.title) {
            throw new Error('Title is required for create operation');
          }
          const todo = todoManager.createTodo(
            params.title,
            params.description,
            params.priority,
            params.tags
          );
          return {
            success: true,
            todo,
            message: `Created todo: ${todo.title}`
          };

        case 'create_batch':
          if (!params.todos || !Array.isArray(params.todos) || params.todos.length === 0) {
            throw new Error('todos array is required for create_batch operation');
          }
          const createdTodos = [];
          for (const todoData of params.todos) {
            if (!todoData.title) {
              throw new Error('Each todo must have a title');
            }
            const batchTodo = todoManager.createTodo(
              todoData.title,
              todoData.description,
              todoData.priority,
              todoData.tags
            );
            createdTodos.push(batchTodo);
          }
          return {
            success: true,
            todos: createdTodos,
            count: createdTodos.length,
            message: `Created ${createdTodos.length} todos`
          };

        case 'update_status':
          if (!params.id || !params.status) {
            throw new Error('ID and status are required for update_status operation');
          }
          const updatedTodo = todoManager.updateTodoStatus(params.id, params.status);
          return {
            success: true,
            todo: updatedTodo,
            message: `Updated todo ${params.id} status to ${params.status}`
          };

        case 'list':
          let todos;
          if (params.filter_status) {
            todos = todoManager.getTodosByStatus(params.filter_status);
          } else if (params.filter_priority) {
            todos = todoManager.getTodosByPriority(params.filter_priority);
          } else {
            todos = todoManager.getAllTodos();
          }
          return {
            success: true,
            todos,
            count: todos.length
          };

        case 'stats':
          const stats = todoManager.getStats();
          return {
            success: true,
            stats
          };

        case 'update':
          if (!params.id) {
            throw new Error('ID is required for update operation');
          }
          const updates: any = {};
          if (params.title !== undefined) updates.title = params.title;
          if (params.description !== undefined) updates.description = params.description;
          if (params.priority !== undefined) updates.priority = params.priority;
          if (params.tags !== undefined) updates.tags = params.tags;

          const updated = todoManager.updateTodo(params.id, updates);
          return {
            success: true,
            todo: updated,
            message: `Updated todo ${params.id}`
          };

        case 'delete':
          if (!params.id) {
            throw new Error('ID is required for delete operation');
          }
          const deleted = todoManager.deleteTodo(params.id);
          return {
            success: deleted,
            message: deleted ? `Deleted todo ${params.id}` : `Todo ${params.id} not found`
          };

        case 'search':
          if (!params.query) {
            throw new Error('Query is required for search operation');
          }
          const searchResults = todoManager.searchTodos(params.query);
          return {
            success: true,
            todos: searchResults,
            count: searchResults.length,
            query: params.query
          };

        case 'clear_completed':
          const clearedCount = todoManager.clearCompletedTodos();
          return {
            success: true,
            clearedCount,
            message: `Cleared ${clearedCount} completed todos`
          };

        default:
          throw new Error(`Unknown operation: ${params.operation}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export const todoTool = new TodoTool();