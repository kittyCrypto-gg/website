import { Clusteriser } from './clusterise.js';

let blogClusteriser = null;

// Ensure .blog-container is inside .rss-scroll-2, creating/wrapping as needed
function ensureBlogScrollWrapper() {
  if (location.pathname.includes("blog.html")) {
    return {
      scrollBox: null,
      blogContainer: document.querySelector('.blog-container')
    };
  }
  
  const wrapper = document.querySelector('.blog-wrapper');
  if (!wrapper) return null;

  let scrollBox     = wrapper.querySelector('.rss-scroll-2');
  let blogContainer = wrapper.querySelector('.blog-container');

  if (!blogContainer) {
    blogContainer = document.createElement('div');
    blogContainer.className = 'blog-container';
  }

  if (!scrollBox) {
    scrollBox = document.createElement('div');
    scrollBox.className = 'rss-scroll-2';
    scrollBox.appendChild(blogContainer);

    [...wrapper.children].forEach(child => {
      if (child !== scrollBox && child.classList?.contains('blog-container')) {
        wrapper.removeChild(child);
      }
    });

    const hdr = wrapper.querySelector('.comments-header');
    hdr?.nextSibling
      ? wrapper.insertBefore(scrollBox, hdr.nextSibling)
      : wrapper.appendChild(scrollBox);
  }

  if (!scrollBox.contains(blogContainer)) scrollBox.appendChild(blogContainer);
  return { scrollBox, blogContainer };
}

function adjustBlogScrollHeight() {
  const { scrollBox } = ensureBlogScrollWrapper() || {};
  if (!scrollBox) return;

  const posts = scrollBox.querySelectorAll('.rss-post-block');
  if (posts.length === 0) return;

  const scrollTop = scrollBox.scrollTop;
  let firstIndex = 0;

  // Find the post whose top is closest to (but not greater than) scrollTop
  for (let i = 0; i < posts.length; i++) {
    if (posts[i].offsetTop <= scrollTop) {
      firstIndex = i;
    } else {
      break;
    }
  }

  // The next post after the topmost one in view
  const secondIndex = (firstIndex + 1 < posts.length) ? firstIndex + 1 : firstIndex;

  const firstHeight = posts[firstIndex].offsetHeight;
  const secondHeight = posts[secondIndex].offsetHeight;

  // If only one post left, don't double-count
  scrollBox.style.maxHeight = (firstIndex === secondIndex)
    ? `${firstHeight}px`
    : `${firstHeight + secondHeight}px`;
}

function setupDynamicScrollBox() {
  const { scrollBox } = ensureBlogScrollWrapper() || {};
  if (!scrollBox) return;

  scrollBox.addEventListener('transitionend', adjustBlogScrollHeight, true);
  scrollBox.addEventListener('scroll',        adjustBlogScrollHeight, { passive: true });
  window.addEventListener('resize',           adjustBlogScrollHeight);
}

function triggerAdjustOnToggles() {
  const blog = document.querySelector('.blog-container');
  if (!blog) return;

  blog.addEventListener('click', ev => {
    if (ev.target.closest('.rss-post-toggle')) {
      /* wait for animation to finish */
      setTimeout(adjustBlogScrollHeight, 350);
    }
  });
}

// Utility: Parse the XML and extract items
function parseRSS(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  return Array.from(doc.querySelectorAll('item')).map(item => {
    const contentTags = item.getElementsByTagName('content:encoded');
    const contentEncoded = (contentTags.length ? contentTags[0].textContent.trim() : "");
    return {
      title: item.querySelector('title')?.textContent.trim() || '',
      description: item.querySelector('description')?.textContent.trim() || '',
      content: contentEncoded,
      pubDate: item.querySelector('pubDate')?.textContent.trim() || '',
      author: item.querySelector('author')?.textContent.trim() || 'Kitty',
      guid: item.querySelector('guid')?.textContent.trim() || ''
    };
  });
}

// Utility: Format date to yyyy.mm.dd
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
}

// Render a single post as HTML string
function renderPost(post) {
  const contentHtml = marked.parse(post.content);
  return `
    <div class="rss-post-block">
      <div class="rss-post-toggle" tabindex="0" role="button" aria-expanded="false">
        <div class="rss-post-header">
          <span class="summary-arrow">▶️</span>
          <span class="rss-post-title">${post.title}</span>
          <span class="rss-post-date">${formatDate(post.pubDate)}</span>
        </div>
        <div class="rss-post-meta"><span class="rss-post-author">By: ${post.author}</span></div>
        <div class="rss-post-summary summary-collapsed">
          <span class="summary-text">${post.description}</span>
        </div>
      </div>
      <div class="rss-post-content content-collapsed" style="overflow: hidden; max-height: 0;">${contentHtml}</div>
    </div>
  `;
}

// Attach toggle logic to all visible posts
function attachToggleLogic(postDiv) {
  const toggleDiv = postDiv.querySelector('.rss-post-toggle');
  const headerDiv = toggleDiv.querySelector('.rss-post-header');
  const arrowSpan = headerDiv.querySelector('.summary-arrow');
  const contentDiv = postDiv.querySelector('.rss-post-content');

  function togglePost() {
    const expanded = contentDiv.classList.toggle('content-expanded');
    contentDiv.classList.toggle('content-collapsed', !expanded);
    toggleDiv.setAttribute('aria-expanded', expanded);
    if (expanded) {
      arrowSpan.textContent = '🔽';
      contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
    } else {
      arrowSpan.textContent = '▶️';
      contentDiv.style.maxHeight = '0px';
    }
    toggleDiv.blur();
  }

  toggleDiv.addEventListener('click', togglePost);
  toggleDiv.addEventListener('keypress', function (e) {
    if (e.key === "Enter" || e.key === " ") {
      togglePost();
    }
  });

  contentDiv.addEventListener('click', function () {
    if (contentDiv.classList.contains('content-expanded')) {
      togglePost();
    }
  });
}

function attachAllToggles(container) {
  container.querySelectorAll('.rss-post-block').forEach(postDiv => {
    attachToggleLogic(postDiv);
  });
}

// Fetch and render the feed
async function loadBlogFeed() {
  const result = ensureBlogScrollWrapper();
  if (!result) return;
  const { scrollBox, blogContainer: container } = result;
  container.innerHTML = '';

  const response = await fetch('https://rss.kittycrypto.gg/rss/kittycrypto');
  const xmlText = await response.text();
  const posts = parseRSS(xmlText);
  const rows = posts.map(post => renderPost(post));

  if (!blogClusteriser) {
    blogClusteriser = new Clusteriser(container);
    await blogClusteriser.init();
  }
  blogClusteriser.update(rows);

  // Wait for DOM update (Clusteriser may be async), then attach toggles and height adjustment logic.
  requestAnimationFrame(() => {
    attachAllToggles(container);
    triggerAdjustOnToggles();
    setupDynamicScrollBox();
    setTimeout(adjustBlogScrollHeight, 100);
  });
}

window.addEventListener('DOMContentLoaded', loadBlogFeed);