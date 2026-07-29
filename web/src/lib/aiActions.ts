// lib/aiActions.ts

import { useEditorStore } from '@/store/useEditorStore'

/**
 * Restituisce il testo su cui operano le azioni AI.
 * Ora se c'è testo selezionato prende quello, se no prende tutto il testo. 
 */
export function getActiveText(): string {
  const { selectedText, currentText } = useEditorStore.getState()

  //Trimma per evitare spazi bianchi
  return selectedText.trim() !== '' ? selectedText : currentText
}
