import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StudyMaterialScreen } from '../components/StudyMaterialScreen';
import { NotifyProvider } from '../context/NotifyContext';
import type { Deck } from '../types';

vi.mock('../utils/groq', () => ({
  createGroqClient: vi.fn(),
  getAiConfig: vi.fn(() => null),
  structureStudyMaterial: vi.fn(),
}));

const makeDeck = (studyMaterial: string): Deck => ({
  id: 'deck-1',
  name: 'CCNA-1',
  description: '',
  studyMaterial,
  createdAt: '2026-01-01',
});

const MULTI_PAGE = [
  '## Section One',
  'Content of the first section.',
  '',
  '## Section Two',
  'Content of the second section.',
  '',
  '## Section Three',
  'Content of the third section.',
].join('\n');

const renderScreen = (material: string, editing = false) =>
  render(
    <NotifyProvider>
      <StudyMaterialScreen
        deck={makeDeck(material)}
        cards={[]}
        onGoBack={vi.fn()}
        editing={editing}
        onEditingChange={vi.fn()}
        onUpdateDeck={vi.fn(async () => {})}
      />
    </NotifyProvider>,
  );

describe('StudyMaterialScreen height stability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sizes the card with stable svh units, never dynamic dvh', () => {
    const { container } = renderScreen(MULTI_PAGE);
    const wrapper = container.querySelector('.animate-fade-in');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain('100svh');
    expect(wrapper!.className).not.toContain('100dvh');
  });

  it('gives the editor textarea a fixed pixel min-height, not a viewport-relative one', () => {
    renderScreen(MULTI_PAGE, true);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveStyle({ minHeight: '240px' });
  });

  it('navigates pages by scrolling the card content, not the page', async () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.scrollTo = scrollTo;

    renderScreen(MULTI_PAGE);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(scrollTo).toHaveBeenCalled(), { timeout: 1500 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
