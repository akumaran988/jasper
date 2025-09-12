import { ToolDisplayHandler, DisplayContext, DisplayResult } from '../types.js';

export class WebFetchDisplayHandler implements ToolDisplayHandler {
  toolName = 'web_fetch';
  
  canHandle(context: DisplayContext): boolean {
    return context.toolName === 'web_fetch';
  }
  
  formatResult(context: DisplayContext): DisplayResult {
    const { result, parameters } = context;
    const url = parameters?.url || 'unknown URL';
    
    if (!result.success) {
      return this.handleErrorResult(context);
    }
    
    return this.handleSuccessResult(context);
  }
  
  private handleSuccessResult(context: DisplayContext): DisplayResult {
    const { result, parameters } = context;
    const url = parameters?.url || 'unknown URL';
    
    let content = '';
    
    // Add request header
    content += `🌐 Fetched: ${url}\n`;
    
    // Add response metadata
    if (result.result?.status) {
      const status = result.result.status;
      const statusEmoji = this.getStatusEmoji(status);
      content += `${statusEmoji} Status: ${status}\n`;
    }
    
    if (result.result?.contentType) {
      content += `📄 Content-Type: ${result.result.contentType}\n`;
    }
    
    if (result.result?.contentLength) {
      content += `📊 Size: ${this.formatBytes(result.result.contentLength)}\n`;
    }
    
    if (result.result?.responseTime) {
      content += `⏱️ Response time: ${result.result.responseTime}ms\n`;
    }
    
    content += '\n';
    
    // Handle different content types
    const contentType = result.result?.contentType || '';
    const responseContent = result.result?.content || result.stdout || '';
    
    if (contentType.includes('application/json')) {
      return this.formatJsonResponse(content, responseContent);
    }
    
    if (contentType.includes('text/html')) {
      return this.formatHtmlResponse(content, responseContent, url);
    }
    
    if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
      return this.formatXmlResponse(content, responseContent);
    }
    
    if (contentType.includes('text/')) {
      return this.formatTextResponse(content, responseContent);
    }
    
    // Binary or unknown content
    return this.formatBinaryResponse(content, result.result);
  }
  
  private formatJsonResponse(header: string, content: string): DisplayResult {
    let formattedContent = header + '📋 JSON Response:\n';
    
    try {
      const parsed = JSON.parse(content);
      formattedContent += JSON.stringify(parsed, null, 2);
    } catch {
      formattedContent += content;
    }
    
    return {
      content: formattedContent,
      isFileContent: false,
      shouldCollapse: content.length > 1000
    };
  }
  
  private formatHtmlResponse(header: string, content: string, url: string): DisplayResult {
    let formattedContent = header + '🌐 HTML Response:\n';
    
    // Try to extract useful information from HTML
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      formattedContent += `📖 Title: ${titleMatch[1].trim()}\n`;
    }
    
    const metaDescription = content.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
    if (metaDescription) {
      formattedContent += `📝 Description: ${metaDescription[1].trim()}\n`;
    }
    
    // Show a preview of the content
    const textContent = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const preview = textContent.substring(0, 300);
    
    formattedContent += '\n📄 Content preview:\n';
    formattedContent += preview + (textContent.length > 300 ? '...' : '');
    
    return {
      content: formattedContent,
      isFileContent: false,
      shouldCollapse: true
    };
  }
  
  private formatXmlResponse(header: string, content: string): DisplayResult {
    const formattedContent = header + '📄 XML Response:\n' + content;
    
    return {
      content: formattedContent,
      isFileContent: false,
      shouldCollapse: content.length > 800
    };
  }
  
  private formatTextResponse(header: string, content: string): DisplayResult {
    const formattedContent = header + '📝 Text Response:\n' + content;
    
    return {
      content: formattedContent,
      isFileContent: false,
      shouldCollapse: content.length > 1000
    };
  }
  
  private formatBinaryResponse(header: string, result: any): DisplayResult {
    let content = header + '📦 Binary Response:\n';
    
    if (result.contentLength) {
      content += `Size: ${this.formatBytes(result.contentLength)}\n`;
    }
    
    if (result.contentType) {
      content += `Type: ${result.contentType}\n`;
    }
    
    content += '\n[Binary content not displayed]';
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private handleErrorResult(context: DisplayContext): DisplayResult {
    const { result, parameters } = context;
    const url = parameters?.url || 'unknown URL';
    
    let content = '';
    content += `🌐 Failed to fetch: ${url}\n`;
    
    if (result.result?.status) {
      const status = result.result.status;
      const statusEmoji = this.getStatusEmoji(status);
      content += `${statusEmoji} Status: ${status}\n`;
    }
    
    if (result.error) {
      content += `🚨 Error: ${result.error}\n`;
    }
    
    if (result.stderr && result.stderr.trim()) {
      content += '\n🔴 Details:\n';
      content += result.stderr.trim();
    }
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  getSummary(context: DisplayContext): string {
    const { result, parameters } = context;
    const url = this.truncateUrl(parameters?.url || 'unknown');
    
    if (!result.success) {
      const status = result.result?.status;
      return `❌ ${url} ${status ? `(${status})` : '(failed)'}`;
    }
    
    const status = result.result?.status || 200;
    const size = result.result?.contentLength;
    const sizeText = size ? ` (${this.formatBytes(size)})` : '';
    
    return `✅ ${url} (${status})${sizeText}`;
  }
  
  shouldCollapse(context: DisplayContext): boolean {
    const content = context.result.result?.content || context.result.stdout || '';
    return content.length > 1200;
  }
  
  private getStatusEmoji(status: number): string {
    if (status >= 200 && status < 300) return '✅';
    if (status >= 300 && status < 400) return '🔄';
    if (status >= 400 && status < 500) return '⚠️';
    if (status >= 500) return '❌';
    return '❓';
  }
  
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  private truncateUrl(url: string, maxLength: number = 60): string {
    if (url.length <= maxLength) return url;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const path = urlObj.pathname + urlObj.search;
      
      if (domain.length + 10 >= maxLength) {
        return domain.substring(0, maxLength - 3) + '...';
      }
      
      const remainingLength = maxLength - domain.length - 3;
      if (path.length > remainingLength) {
        return domain + path.substring(0, remainingLength - 3) + '...';
      }
      
      return domain + path;
    } catch {
      return url.substring(0, maxLength - 3) + '...';
    }
  }
}