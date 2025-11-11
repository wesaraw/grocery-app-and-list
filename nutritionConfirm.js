import {
  getPendingMatch,
  removePendingMatch
} from './utils/nutritionMatching.js';
import { persistIngredientSelection } from './utils/fdcClient.js';

let itemName = '';
let pendingMatch = null;
let selectedFdcId = null;

function renderStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`.trim();
}

function enableConfirm(enabled) {
  const btn = document.getElementById('confirmBtn');
  if (btn) btn.disabled = !enabled;
}

function renderCandidates() {
  const container = document.getElementById('candidates');
  container.innerHTML = '';
  if (!pendingMatch || !pendingMatch.candidates?.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No candidate matches to display.';
    container.appendChild(empty);
    enableConfirm(false);
    return;
  }
  pendingMatch.candidates.forEach(candidate => {
    const wrapper = document.createElement('label');
    wrapper.className = 'candidate';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'candidate';
    input.value = candidate.fdcId;
    input.addEventListener('change', () => {
      selectedFdcId = candidate.fdcId;
      enableConfirm(true);
      renderStatus('');
    });

    const header = document.createElement('header');
    header.textContent = candidate.description || 'Untitled food';

    const details = document.createElement('div');
    details.innerHTML = `
      <small>Data Type: ${candidate.dataType || '—'}</small>
      <small>Brand: ${candidate.brandOwner || '—'}</small>
      <small class="score">Score: ${(candidate.score * 100).toFixed(1)}%</small>
      ${candidate.householdServingFullText ? `<small>Portion: ${candidate.householdServingFullText}</small>` : ''}
    `;

    wrapper.appendChild(input);
    wrapper.appendChild(header);
    wrapper.appendChild(details);
    container.appendChild(wrapper);
  });
  enableConfirm(false);
}

async function loadPending() {
  pendingMatch = await getPendingMatch(itemName);
  const itemEl = document.getElementById('itemName');
  if (!pendingMatch) {
    itemEl.textContent = itemName || '';
    renderStatus('No pending matches for this item.', 'error');
    enableConfirm(false);
    return;
  }
  itemEl.textContent = pendingMatch.itemName || itemName;
  renderCandidates();
}

async function confirmSelection() {
  if (!pendingMatch || !selectedFdcId) return;
  const candidate = pendingMatch.candidates.find(c => c.fdcId === selectedFdcId);
  if (!candidate) {
    renderStatus('Please choose a candidate.', 'error');
    return;
  }
  enableConfirm(false);
  renderStatus('Saving selection…');
  try {
    await persistIngredientSelection(itemName, candidate, {
      unitDefault: pendingMatch.unitDefault || 'g',
      confidence: candidate.score
    });
    await removePendingMatch(itemName);
    renderStatus('Nutrition data saved.', 'success');
    setTimeout(() => window.close(), 750);
  } catch (err) {
    console.error('Failed to persist selection', err);
    renderStatus('Failed to save selection. Please try again.', 'error');
    enableConfirm(true);
  }
}

async function skipSelection() {
  await removePendingMatch(itemName);
  renderStatus('Match skipped. You can retry from the inventory timeline.', 'warning');
  setTimeout(() => window.close(), 750);
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  itemName = params.get('item') || '';
  if (!itemName) {
    renderStatus('No item specified.', 'error');
    return;
  }
  loadPending();
  document.getElementById('confirmBtn').addEventListener('click', confirmSelection);
  document.getElementById('skipBtn').addEventListener('click', skipSelection);
});
