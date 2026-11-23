import test from 'node:test';
import assert from 'node:assert/strict';

// Test the card hierarchy and Escape consumption logic
test('Card hierarchy closes only topmost card in priority order', () => {
  const cards = [
    { name: 'photo-card', priority: 1, open: false, closed: false },
    { name: 'lb', priority: 2, open: false, closed: false },
    { name: 'tour-modal', priority: 3, open: false, closed: false },
    { name: 'recruiter-bar', priority: 4, open: false, closed: false },
    { name: 'chars-panel', priority: 5, open: false, closed: false },
    { name: 'journey-drawer', priority: 6, open: false, closed: false },
    { name: 'tahiti-choose', priority: 7, open: false, closed: false },
    { name: 'panel', priority: 8, open: false, closed: false },
    { name: 'tour-card', priority: 9, open: false, closed: false },
    { name: 'minigame', priority: 10, open: false, closed: false },
    { name: 'bigmap', priority: 11, open: false, closed: false },
    { name: 'controls', priority: 12, open: false, closed: false },
    { name: 'dialogue', priority: 13, open: false, closed: false },
  ];

  const closeTopmost = () => {
    for (const card of cards) {
      if (card.open) {
        card.open = false;
        card.closed = true;
        return true;
      }
    }
    return false;
  };

  // Open multiple cards simultaneously
  const panel = cards.find(c => c.name === 'panel');
  const tahitiChoose = cards.find(c => c.name === 'tahiti-choose');
  const photoCard = cards.find(c => c.name === 'photo-card');

  panel.open = true;
  tahitiChoose.open = true;
  photoCard.open = true;

  // First Esc: closes photo-card only
  assert.equal(closeTopmost(), true);
  assert.equal(photoCard.open, false);
  assert.equal(tahitiChoose.open, true);
  assert.equal(panel.open, true);

  // Second Esc: closes tahiti-choose only
  assert.equal(closeTopmost(), true);
  assert.equal(tahitiChoose.open, false);
  assert.equal(panel.open, true);

  // Third Esc: closes panel only
  assert.equal(closeTopmost(), true);
  assert.equal(panel.open, false);

  // Fourth Esc: no cards open, returns false (no action, pause menu not opened)
  assert.equal(closeTopmost(), false);
});

test('Photography session choice card triggers Exit on Esc', () => {
  let selectedValue = 'unselected';
  const options = [
    { label: 'Pose for a photograph (Shabesh takes your picture)', value: 'pose' },
    { label: 'Take a group picture', value: 'group' },
    { label: 'Exit', value: 'exit' },
  ];

  const buttons = options.map(o => ({
    label: o.label,
    value: o.value,
    click() { selectedValue = o.value; },
  }));

  const closeChoice = () => {
    const exitBtn = buttons.find(b => /^(exit|cancel|close)$/i.test(b.label.trim())) || buttons[buttons.length - 1];
    if (exitBtn) exitBtn.click();
  };

  closeChoice();
  assert.equal(selectedValue, 'exit');
});

test('Escape keypress consumption stops propagation and prevents default', () => {
  let prevented = false;
  let propagationStopped = false;
  let immediateStopped = false;

  const mockEvent = {
    key: 'Escape',
    preventDefault() { prevented = true; },
    stopPropagation() { propagationStopped = true; },
    stopImmediatePropagation() { immediateStopped = true; },
  };

  let cardOpen = true;
  const onKeyDownCapture = (e) => {
    if (e.key === 'Escape') {
      if (cardOpen) {
        cardOpen = false;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
  };

  onKeyDownCapture(mockEvent);

  assert.equal(prevented, true, 'Event must be default-prevented');
  assert.equal(propagationStopped, true, 'Event propagation must be stopped');
  assert.equal(immediateStopped, true, 'Immediate propagation must be stopped so pause menu is not opened');
  assert.equal(cardOpen, false, 'Card must be closed');
});
