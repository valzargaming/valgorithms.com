'use strict';

// Discord link previews: https://docs.discord.com/developers/link-previews/component-embeds
const MAX_BYTES = 3000;
const BRAND_IMAGE = { path: 'brand-preview.png', width: 256, height: 256, type: 'image/png' };
const ACCENT = '#7c6cff'; // Existing site favicon color.

function httpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid preview URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid preview URL');
  return value;
}

function validatePayload(payload) {
  if (!payload || Object.keys(payload).join() !== 'component' || payload.component?.type !== 17) throw new Error('Expected one root Container');
  let count = 0;
  let galleryItems = 0;
  function children(value, min, max, types) {
    if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('Invalid component children');
    value.forEach((child) => {
      if (!types.includes(child?.type)) throw new Error('Invalid component placement');
      visit(child);
    });
  }
  function media(value) {
    const url = new URL(httpUrl(value?.url));
    if (!/\.(png|gif|jpe?g|webp|avif|mp4|webm|mov)$/i.test(url.pathname)) throw new Error('Unsupported preview media');
  }
  function visit(component) {
    if (!component || typeof component !== 'object') throw new Error('Invalid component');
    if (++count > 40) throw new Error('Too many components');
    if (component.type === 17) {
      if (component !== payload.component) throw new Error('Nested Container');
      children(component.components, 1, 39, [1, 9, 10, 12, 14]);
    } else if (component.type === 1) {
      children(component.components, 1, 5, [2]);
    } else if (component.type === 9) {
      children(component.components, 1, 3, [10]);
      if (![2, 11].includes(component.accessory?.type)) throw new Error('Invalid section accessory');
      visit(component.accessory);
    } else if (component.type === 2) {
      const keys = ['id', 'type', 'url', 'style', 'label', 'emoji', 'disabled'];
      if (component.style !== 5 || Object.keys(component).some((key) => !keys.includes(key)) || !(component.label || component.emoji)) throw new Error('Only link buttons are allowed');
      if (component.label && (typeof component.label !== 'string' || component.label.length > 80)) throw new Error('Invalid button label');
      httpUrl(component.url);
    } else if (component.type === 10) {
      if (typeof component.content !== 'string' || !component.content || component.content.length > 4000) throw new Error('Invalid text display');
    } else if (component.type === 11) {
      media(component.media);
    } else if (component.type === 12) {
      if (!Array.isArray(component.items) || !component.items.length) throw new Error('Empty gallery');
      galleryItems += component.items.length;
      if (galleryItems > 10) throw new Error('Too many gallery items');
      component.items.forEach((item) => media(item.media));
    } else if (component.type !== 14) {
      throw new Error('Unsupported component');
    }
  }
  visit(payload.component);
  return payload;
}

function serializePayload(payload) {
  validatePayload(payload);
  // Escape raw-text HTML boundaries and both template token syntaxes. Measure
  // the escaped UTF-8 string that actually goes inside the script element.
  const json = JSON.stringify(payload).replace(/[<>&%\u2028\u2029]/g, (char) =>
    '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
  // Braces in strings, rather than JSON structure, must survive template passes.
  const safe = json.replace(/\{\{/g, '\\u007b\\u007b');
  if (Buffer.byteLength(safe, 'utf8') > MAX_BYTES) throw new Error('Preview exceeds 3000 UTF-8 bytes');
  return safe;
}

function markdownText(value) {
  return String(value).replace(/([\\`*_{}\[\]()<>#|~])/g, '\\$1');
}

function createPayload({ title, description, url, image, links }) {
  return { component: { type: 17, accent_color: parseInt(ACCENT.slice(1), 16), components: [
    { type: 9, components: [{ type: 10, content: `## ${markdownText(title)}\n${markdownText(description)}` }],
      accessory: { type: 11, media: { url: httpUrl(image) }, description: 'Site v monogram' } },
    { type: 14, spacing: 1 },
    { type: 1, components: (links || [{ label: 'Open page', url }]).map((link) => ({ type: 2, style: 5, label: link.label, url: httpUrl(link.url) })) },
  ] } };
}

module.exports = { MAX_BYTES, BRAND_IMAGE, ACCENT, httpUrl, validatePayload, serializePayload, createPayload };
