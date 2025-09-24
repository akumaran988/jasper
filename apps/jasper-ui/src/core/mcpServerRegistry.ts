import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MCPServerPackage {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  repository?: string;
  keywords: string[];
  installMethod: 'builtin' | 'npm' | 'git' | 'url';
  installSource?: string;
  scriptPath?: string;
  defaultPort: number;
  capabilities: string[];
  requirements?: {
    node?: string;
    docker?: boolean;
    os?: string[];
  };
  configSchema?: any;
}

export interface MCPServerInstallation {
  package: MCPServerPackage;
  installedPath: string;
  installedAt: Date;
  version: string;
}

export class MCPServerRegistry {
  private installationsFile: string;
  private serversDir: string;

  constructor() {
    // Use user's home directory for installations
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    const jasperDir = path.join(homeDir, '.jasper');
    this.serversDir = path.join(jasperDir, 'mcp-servers');
    this.installationsFile = path.join(jasperDir, 'mcp-installations.json');

    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(path.dirname(this.installationsFile))) {
      fs.mkdirSync(path.dirname(this.installationsFile), { recursive: true });
    }
    if (!fs.existsSync(this.serversDir)) {
      fs.mkdirSync(this.serversDir, { recursive: true });
    }
  }

  /**
   * Load installed MCP servers from disk
   */
  private loadInstallations(): Record<string, MCPServerInstallation> {
    try {
      if (fs.existsSync(this.installationsFile)) {
        const data = fs.readFileSync(this.installationsFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load MCP server installations:', error);
    }
    return {};
  }

  /**
   * Save installed MCP servers to disk
   */
  private saveInstallations(installations: Record<string, MCPServerInstallation>): void {
    try {
      fs.writeFileSync(this.installationsFile, JSON.stringify(installations, null, 2));
    } catch (error) {
      console.error('Failed to save MCP server installations:', error);
    }
  }

  /**
   * Install an MCP server from npm
   */
  async installFromNpm(packageName: string, version = 'latest'): Promise<MCPServerInstallation> {
    console.log(`📦 Installing MCP server: ${packageName}@${version}`);
    
    const installDir = path.join(this.serversDir, packageName);
    
    // Create package.json for isolated installation
    const packageJsonPath = path.join(installDir, 'package.json');
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      name: `jasper-mcp-${packageName}`,
      version: '1.0.0',
      dependencies: {
        [packageName]: version
      }
    }, null, 2));

    // Install the package
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: installDir,
        stdio: 'pipe'
      });

      npm.on('close', (code) => {
        if (code === 0) {
          try {
            // Find the installed package
            const packagePath = path.join(installDir, 'node_modules', packageName);
            const packageJsonFile = path.join(packagePath, 'package.json');
            
            if (!fs.existsSync(packageJsonFile)) {
              throw new Error(`Package.json not found for ${packageName}`);
            }

            const packageInfo = JSON.parse(fs.readFileSync(packageJsonFile, 'utf-8'));
            
            // Look for MCP server entry point
            const scriptPath = this.findMCPServerScript(packagePath, packageInfo);
            
            const serverPackage: MCPServerPackage = {
              id: packageName,
              name: packageInfo.name || packageName,
              description: packageInfo.description || 'MCP Server',
              version: packageInfo.version || version,
              author: packageInfo.author || 'Unknown',
              repository: packageInfo.repository?.url,
              keywords: packageInfo.keywords || [],
              installMethod: 'npm',
              installSource: `${packageName}@${version}`,
              scriptPath,
              defaultPort: packageInfo.mcpServer?.defaultPort || 8080,
              capabilities: packageInfo.mcpServer?.capabilities || [],
              requirements: packageInfo.mcpServer?.requirements,
              configSchema: packageInfo.mcpServer?.configSchema
            };

            const installation: MCPServerInstallation = {
              package: serverPackage,
              installedPath: packagePath,
              installedAt: new Date(),
              version: packageInfo.version || version
            };

            // Save installation
            const installations = this.loadInstallations();
            installations[packageName] = installation;
            this.saveInstallations(installations);

            console.log(`✅ Successfully installed ${packageName}@${version}`);
            resolve(installation);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on('error', reject);
    });
  }

  /**
   * Install an MCP server from a Git repository
   */
  async installFromGit(repoUrl: string, serverName: string): Promise<MCPServerInstallation> {
    console.log(`🔗 Installing MCP server from Git: ${repoUrl}`);
    
    const installDir = path.join(this.serversDir, serverName);
    
    // Clone the repository
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['clone', repoUrl, installDir], {
        stdio: 'pipe'
      });

      git.on('close', async (code) => {
        if (code === 0) {
          try {
            // Install dependencies if package.json exists
            const packageJsonPath = path.join(installDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
              await this.runNpmInstall(installDir);
            }

            // Create server package info
            const packageInfo = fs.existsSync(packageJsonPath) 
              ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
              : {};

            const scriptPath = this.findMCPServerScript(installDir, packageInfo);

            const serverPackage: MCPServerPackage = {
              id: serverName,
              name: packageInfo.name || serverName,
              description: packageInfo.description || 'Git MCP Server',
              version: packageInfo.version || '1.0.0',
              author: packageInfo.author || 'Unknown',
              repository: repoUrl,
              keywords: packageInfo.keywords || [],
              installMethod: 'git',
              installSource: repoUrl,
              scriptPath,
              defaultPort: packageInfo.mcpServer?.defaultPort || 8080,
              capabilities: packageInfo.mcpServer?.capabilities || [],
              requirements: packageInfo.mcpServer?.requirements
            };

            const installation: MCPServerInstallation = {
              package: serverPackage,
              installedPath: installDir,
              installedAt: new Date(),
              version: packageInfo.version || '1.0.0'
            };

            // Save installation
            const installations = this.loadInstallations();
            installations[serverName] = installation;
            this.saveInstallations(installations);

            console.log(`✅ Successfully installed ${serverName} from Git`);
            resolve(installation);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`git clone failed with code ${code}`));
        }
      });

      git.on('error', reject);
    });
  }

  /**
   * Find the MCP server script in an installed package
   */
  private findMCPServerScript(packagePath: string, packageInfo: any): string {
    // Check if package.json specifies MCP server entry point
    if (packageInfo.mcpServer?.main) {
      return path.join(packagePath, packageInfo.mcpServer.main);
    }

    // Common patterns to look for
    const commonPaths = [
      'dist/index.js',
      'lib/index.js',
      'src/index.js',
      'index.js',
      'dist/server.js',
      'lib/server.js',
      'src/server.js',
      'server.js'
    ];

    for (const commonPath of commonPaths) {
      const fullPath = path.join(packagePath, commonPath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Fallback to package.json main field
    if (packageInfo.main) {
      return path.join(packagePath, packageInfo.main);
    }

    throw new Error(`Could not find MCP server entry point in ${packagePath}`);
  }

  /**
   * Run npm install in a directory
   */
  private async runNpmInstall(directory: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: directory,
        stdio: 'pipe'
      });

      npm.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on('error', reject);
    });
  }

  /**
   * List all installed MCP servers
   */
  listInstalled(): MCPServerInstallation[] {
    const installations = this.loadInstallations();
    return Object.values(installations);
  }

  /**
   * Get a specific installed MCP server
   */
  getInstalled(serverId: string): MCPServerInstallation | null {
    const installations = this.loadInstallations();
    return installations[serverId] || null;
  }

  /**
   * Uninstall an MCP server
   */
  async uninstall(serverId: string): Promise<void> {
    const installations = this.loadInstallations();
    const installation = installations[serverId];
    
    if (!installation) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    console.log(`🗑️ Uninstalling MCP server: ${serverId}`);

    // Remove from file system
    if (fs.existsSync(installation.installedPath)) {
      fs.rmSync(installation.installedPath, { recursive: true, force: true });
    }

    // Remove from registry
    delete installations[serverId];
    this.saveInstallations(installations);

    console.log(`✅ Successfully uninstalled ${serverId}`);
  }

  /**
   * Update an MCP server
   */
  async update(serverId: string): Promise<MCPServerInstallation> {
    const installation = this.getInstalled(serverId);
    
    if (!installation) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    console.log(`🔄 Updating MCP server: ${serverId}`);

    // Uninstall current version
    await this.uninstall(serverId);

    // Reinstall with same method
    switch (installation.package.installMethod) {
      case 'npm':
        return this.installFromNpm(installation.package.id);
      case 'git':
        return this.installFromGit(installation.package.installSource!, serverId);
      default:
        throw new Error(`Cannot update ${installation.package.installMethod} installation`);
    }
  }

  /**
   * Get the script path for an installed server
   */
  getServerScriptPath(serverId: string): string | null {
    const installation = this.getInstalled(serverId);
    return installation?.package.scriptPath || null;
  }
}

// Global registry instance
export const mcpServerRegistry = new MCPServerRegistry();