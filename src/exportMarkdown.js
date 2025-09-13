(function exportMarkdown() {
  function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace("T", " ").replace(/\..+/, "");
  }

  function getChatUrl() {
    return window.location.href;
  }

  function getChatDate() {
    // Try to extract chat creation date from the page
    // Look for various possible date indicators
    
    // Method 1: Check for any time elements or date strings in the DOM
    const timeElements = document.querySelectorAll('time[datetime]');
    for (const timeEl of timeElements) {
      const datetime = timeEl.getAttribute('datetime');
      if (datetime) {
        try {
          const date = new Date(datetime);
          if (!isNaN(date.getTime())) {
            return date.toISOString().replace("T", " ").replace(/\..+/, "");
          }
        } catch (e) {}
      }
    }
    
    // Method 2: Look for date patterns in the HTML content
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g,
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g
    ];
    
    const bodyText = document.body.textContent || document.body.innerText || '';
    for (const pattern of datePatterns) {
      const matches = bodyText.match(pattern);
      if (matches && matches.length > 0) {
        try {
          const date = new Date(matches[0]);
          if (!isNaN(date.getTime())) {
            return date.toISOString().replace("T", " ").replace(/\..+/, "");
          }
        } catch (e) {}
      }
    }
    
    // Method 3: Check for data attributes that might contain timestamps
    const elementsWithData = document.querySelectorAll('[data-timestamp], [data-created], [data-time]');
    for (const el of elementsWithData) {
      const timestamp = el.dataset.timestamp || el.dataset.created || el.dataset.time;
      if (timestamp) {
        try {
          const date = new Date(parseInt(timestamp) > 1000000000000 ? parseInt(timestamp) : parseInt(timestamp) * 1000);
          if (!isNaN(date.getTime())) {
            return date.toISOString().replace("T", " ").replace(/\..+/, "");
          }
        } catch (e) {}
      }
    }
    
    // If no chat date found, return null
    return null;
  }

  function getContents() {
    let title = document.title.replace(/ - Claude.*$/, "");
    const all = [];
    const allNodes = Array.from(document.querySelectorAll('.font-user-message, .font-claude-response'));
    for (const node of allNodes) {
      if (node.classList.contains('font-user-message')) {
        all.push({type: 'user', node});
      } else if (node.classList.contains('font-claude-response')) {
        all.push({type: 'claude', node});
      }
    }
    return { elements: all, title };
  }

  function consoleSave(data, filename) {
    if (!data) {
      console.error('No data');
      return;
    }
    if (!filename) filename = 'console.md';
    if (typeof data === "object") {
      data = JSON.stringify(data, undefined, 2);
    }
    const blob = new Blob([data], {type: 'text/plain'});
    const e = document.createElement('a');
    e.download = filename;
    e.href = URL.createObjectURL(blob);
    document.body.appendChild(e);
    e.click();
    setTimeout(() => {
      document.body.removeChild(e);
      URL.revokeObjectURL(e.href);
    }, 100);
  }

  // Only escape Markdown special chars when necessary
  function escapeMarkdown(text, context = "") {
    if (context === "code") return text;
    if (context === "inlinecode") return text.replace(/`/g, "\\`");
    return text
      .replace(/([*_#[\]`|])/g, "\\$1")
      .replace(/^(\s*)(>)/gm, "$1\\>")
      .replace(/^(\s*)([-+])(\s)/gm, "$1$2$3")
      .replace(/^(\s*)(\d+)\.(\s)/gm, "$1$2.$3");
  }

  // Helper: skip standalone language lines before code blocks
  function filterChildrenSkippingLangLines(children) {
    const out = [];
    for (let i = 0; i < children.length; ++i) {
      const node = children[i];
      // If this is a <div> with styling classes containing language name, and next is <pre>, skip it
      if (
        node.tagName === "DIV" &&
        node.className && 
        node.className.includes("text-text-500") &&
        node.className.includes("font-small") &&
        node.textContent.trim().match(/^[a-zA-Z0-9_+-]+$/) &&
        children[i + 1] &&
        children[i + 1].tagName === "PRE"
      ) {
        continue;
      }
      // Also handle the older pattern for backwards compatibility
      if (
        (node.tagName === "P" || node.tagName === "DIV") &&
        node.childNodes.length === 1 &&
        node.textContent.trim().match(/^[a-zA-Z0-9_+-]+$/) &&
        children[i + 1] &&
        children[i + 1].tagName === "PRE" &&
        !node.className?.includes("whitespace-normal") // Don't skip actual content paragraphs
      ) {
        continue;
      }
      out.push(node);
    }
    return out;
  }

  function nodeToMarkdown(node, inBlockquote = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeMarkdown(node.textContent);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName;

    // Skip language specifier divs that appear before code blocks
    if (
      tag === "DIV" &&
      node.className && 
      node.className.includes("text-text-500") &&
      node.className.includes("font-small") &&
      node.textContent.trim().match(/^[a-zA-Z0-9_+-]+$/)
    ) {
      return "";
    }

    // Headings
    if (tag === "H1") {
      return `# ${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}\n\n`;
    }
    if (tag === "H2") {
      return `## ${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}\n\n`;
    }
    if (tag === "H3") {
      return `### ${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}\n\n`;
    }
    if (tag === "H4") {
      return `#### ${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}\n\n`;
    }
    if (tag === "H5") {
      return `##### ${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}\n\n`;
    }
    if (tag === "H6") {
      return `###### ${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}\n\n`;
    }

    // Inline code
    if (tag === "CODE" && node.parentElement.tagName !== "PRE") {
      return "`" + escapeMarkdown(node.textContent, "inlinecode") + "`";
    }

    // Bold
    if (tag === "STRONG" || tag === "B") {
      return `**${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}**`;
    }

    // Italic
    if (tag === "EM" || tag === "I") {
      return `*${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}*`;
    }

    // Links
    if (tag === "A" && node.href) {
      return `[${Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("")}](${node.href})`;
    }

    // Handle PRE elements that contain tables (check BEFORE general PRE handling)
    if (tag === "PRE" && node.querySelector("table")) {
      const table = node.querySelector("table");
      return nodeToMarkdown(table, inBlockquote);
    }

    // Block code
    if (tag === "PRE") {
      const codeEle = node.querySelector("code");
      let lang = "";
      if (codeEle && codeEle.classList.length > 0) {
        const match = codeEle.classList[0].match(/language-(\w+)/);
        if (match) lang = match[1];
      }
      const codeText = codeEle ? codeEle.textContent : node.textContent;
      return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`;
    }

    // Lists
    if (tag === "UL") {
      return (
        "\n" +
        Array.from(node.children)
          .filter((li) => li.tagName === "LI")
          .map((li) => `- ${nodeToMarkdown(li, inBlockquote)}\n`)
          .join("")
      );
    }
    if (tag === "OL") {
      return (
        "\n" +
        Array.from(node.children)
          .filter((li) => li.tagName === "LI")
          .map((li) => `1. ${nodeToMarkdown(li, inBlockquote)}\n`)
          .join("")
      );
    }
    if (tag === "LI") {
      return Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("");
    }

    // Tables (both standalone and within PRE elements)
    if (tag === "TABLE") {
      let mdTable = "";
      let colCount = 0;
      const thead = node.querySelector("thead");
      if (thead) {
        const headerCells = Array.from(thead.querySelectorAll("th"));
        colCount = headerCells.length;
        mdTable +=
          "| " +
          headerCells.map((th) => nodeToMarkdown(th, inBlockquote)).join(" | ") +
          " |\n";
        mdTable +=
          "| " +
          Array(colCount).fill("---").join(" | ") +
          " |\n";
      }
      const tbody = node.querySelector("tbody");
      if (tbody) {
        mdTable += Array.from(tbody.querySelectorAll("tr"))
          .map((tr) => {
            return (
              "| " +
              Array.from(tr.children)
                .map((td) => nodeToMarkdown(td, inBlockquote))
                .join(" | ") +
              " |\n"
            );
          })
          .join("");
      }
      return "\n" + mdTable + "\n";
    }
    
    if (tag === "TH" || tag === "TD") {
      return Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("");
    }

    // Paragraphs
    if (tag === "P") {
      let text = Array.from(node.childNodes).map(n => nodeToMarkdown(n, inBlockquote)).join("");
      
      // Convert bold numbered items to proper list format
      // Match patterns like "**1. Text**" or "**1. Text:** more text"
      text = text.replace(/^\*\*(\d+)\.\s*([^*]+?)\*\*(.*)$/g, '1. **$2**$3');
      
      if (inBlockquote) {
        text = text.replace(/^/gm, "> ");
      }
      return text + "\n\n";
    }

    // Blockquotes (for nested blockquotes)
    if (tag === "BLOCKQUOTE") {
      let text = Array.from(node.childNodes).map(n => nodeToMarkdown(n, true)).join("");
      text = text.replace(/^/gm, "> ");
      return text + "\n\n";
    }

    // Fallback: recurse children, skipping standalone language lines before code blocks
    let children = Array.from(node.childNodes);
    children = filterChildrenSkippingLangLines(children);
    return children.map(n => nodeToMarkdown(n, inBlockquote)).join("");
  }

  // Main export logic
  let markdown = "";

  const { elements, title } = getContents();
  const timestamp = getTimestamp();
  const chatUrl = getChatUrl();
  const chatDate = getChatDate();

  // Add title as a markdown link to the chat URL
  markdown += `[Exported from Claude.ai on ${timestamp}](${chatUrl})\n\n`;

  // Chat date is not reliable, so omit it for now
  // // Add chat date if found, otherwise use current timestamp
  // if (chatDate) {
  //   markdown += `**Chat Date:** ${chatDate}\n\n`;
  // } 

  markdown += `\n\n`;

  for (let i = 0; i < elements.length; i++) {
    const {type, node} = elements[i];
    const currentIndex = i; // Store the index in a const to avoid lexical issues
    let mainNode = null;
    if (type === 'user') {
      // Check for file attachments that are DIRECTLY before this user message
      let attachmentContent = "";
      
      // Only look for attachments that are immediately adjacent to this user message
      // This prevents old attachments from being incorrectly associated
      let attachmentContainer = null;
      
      // Look at the immediate parent container structure
      let messageParent = node.parentElement;
      if (messageParent) {
        // Check if there's an attachment container as an immediate previous sibling
        let prevSibling = messageParent.previousElementSibling;
        if (prevSibling && prevSibling.querySelector('[data-testid="file-thumbnail"]')) {
          attachmentContainer = prevSibling;
        }
      }
      
      // Alternative: check if there's an attachment container just before in the same parent
      if (!attachmentContainer) {
        let currentParent = node.parentElement;
        while (currentParent && !attachmentContainer) {
          let prevElement = currentParent.previousElementSibling;
          // Only check the immediate previous element, not all previous elements
          if (prevElement && prevElement.querySelector('[data-testid="file-thumbnail"]')) {
            // Extra validation: make sure there's no other user/claude message between
            // the attachment and this user message
            let elementsBetween = [];
            let walker = prevElement.nextElementSibling;
            while (walker && walker !== currentParent) {
              elementsBetween.push(walker);
              walker = walker.nextElementSibling;
            }
            
            // If there are no user/claude messages between attachment and current message,
            // then this attachment belongs to the current message
            let hasMessagesBetween = elementsBetween.some(el => 
              el.querySelector('.font-user-message, .font-claude-response')
            );
            
            if (!hasMessagesBetween) {
              attachmentContainer = prevElement;
            }
          }
          currentParent = currentParent.parentElement;
        }
      }
      
      if (attachmentContainer) {
        const attachments = Array.from(attachmentContainer.querySelectorAll('[data-testid="file-thumbnail"]'));
        if (attachments.length > 0) {
          attachmentContent += "> 🗣️ Kyle 🗣️\n>\n> **Attachments**:\n";
          for (const attachment of attachments) {
            const titleElement = attachment.querySelector('h3');
            const linesElement = attachment.querySelector('p');
            if (titleElement) {
              let filename = titleElement.textContent.trim();
              if (linesElement && linesElement.textContent.includes('lines')) {
                filename += ` (${linesElement.textContent.trim()})`;
              }
              attachmentContent += `> - ${filename}\n`;
            }
          }
          attachmentContent += ">\n";
        }
      }
      
      // The node itself should be the font-user-message div, which is also the data-testid="user-message" element
      const userMessageNode = node.classList.contains('font-user-message') ? node : node.querySelector('.font-user-message');
      if (!userMessageNode) continue;
      
      let contentParts = [];
      let hasContent = false;
      
      // Process each child element in the user message
      for (const child of userMessageNode.children) {
        if (child.tagName === 'P') {
          // Collect text content (not as blockquote since we'll add ">" later)
          const textContent = nodeToMarkdown(child, false).replace(/\n+$/, "");
          contentParts.push({ type: 'blockquote', content: textContent });
          hasContent = true;
        } else if (child.tagName === 'BLOCKQUOTE') {
          // Handle nested blockquotes (quoted content from previous messages)
          const quotedContent = nodeToMarkdown(child, false).replace(/\n+$/, "");
          contentParts.push({ type: 'blockquote', content: quotedContent });
          hasContent = true;
        } else if (child.tagName === 'DIV' && child.querySelector('pre code')) {
          // Collect code blocks
          const codeContent = nodeToMarkdown(child, false);
          contentParts.push({ type: 'code', content: codeContent });
          hasContent = true;
        } else if (child.tagName === 'UL' || child.tagName === 'OL') {
          // Handle lists
          const listContent = nodeToMarkdown(child, false).replace(/\n+$/, "");
          contentParts.push({ type: 'blockquote', content: listContent });
          hasContent = true;
        } else if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(child.tagName)) {
          // Handle headings
          const headingContent = nodeToMarkdown(child, false).replace(/\n+$/, "");
          contentParts.push({ type: 'blockquote', content: headingContent });
          hasContent = true;
        } else if (child.textContent && child.textContent.trim()) {
          // Handle any other content that has text
          const otherContent = nodeToMarkdown(child, false).replace(/\n+$/, "");
          contentParts.push({ type: 'blockquote', content: otherContent });
          hasContent = true;
        }
      }
      
      // Fallback to original method if no content found
      if (!hasContent) {
        const fallbackNode = node.querySelector('p');
        if (fallbackNode) {
          const textContent = nodeToMarkdown(fallbackNode, false).replace(/\n+$/, "");
          contentParts.push({ type: 'blockquote', content: textContent });
        }
      }
      
      // Build content by treating each section separately
      let userContent = "";
      let needsUserIcon = !attachmentContent; // Only need icon if no attachments (which already have icon)
      
      for (let i = 0; i < contentParts.length; i++) {
        const part = contentParts[i];
        
        if (part.type === 'blockquote') {
          // Start a new blockquote section with user icon
          if (needsUserIcon) {
            userContent += "> 🗣️ Kyle 🗣️\n>\n";
            needsUserIcon = false;
          } else if (userContent.length > 0 && !userContent.endsWith('>\n')) {
            userContent += ">\n";
          }
          
          // Add content with proper ">" prefixing
          let blockquoteContent = part.content.replace(/^/gm, '> ');
          userContent += blockquoteContent + "\n";
          
        } else if (part.type === 'code') {
          // End current blockquote, add code block
          userContent = userContent.replace(/>\s*$/, '').trim();
          userContent += "\n\n" + part.content + "\n\n";
          // Next blockquote section will need a user icon
          needsUserIcon = true;
        }
      }
      
      userContent = userContent.trim() + "\n\n";
      
      markdown += attachmentContent + userContent;
    } else if (type === 'claude') {
      // Check for artifacts first
      const artifacts = Array.from(node.querySelectorAll('.artifact-block-cell'));
      let artifactContent = "";
      if (artifacts.length > 0) {
        artifactContent += "**Artifacts**:\n";
        for (const artifact of artifacts) {
          const titleElement = artifact.querySelector('.leading-tight.text-sm');
          if (titleElement) {
            const title = titleElement.textContent.trim();
            artifactContent += `- ${title}\n`;
          }
        }
        artifactContent += "\n";
      }
      
      // Then process the regular markdown content
      mainNode = node.querySelector('.standard-markdown');
      if (!mainNode) continue;
      markdown += artifactContent + nodeToMarkdown(mainNode, false) + "\n";
    }
  }

  // Clean up excessive whitespace
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with just 2
    .replace(/\n\n(#+\s)/g, '\n$1')  // Remove extra newline before headings
    .trim();

  consoleSave(markdown + "\n", (title || "Claude Chat") + ".md");
  return markdown;
})();