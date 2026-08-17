import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useEditorStore,
  useCurrentText,
  useStreamedOutput,
  useIsGenerating,
  useErrorMessage,
} from './useEditorStore'

beforeEach(() => {
  useEditorStore.setState({
    currentText: '',
    selectedText: '',
    streamedOutput: '',
    isGenerating: false,
    errorMessage: null,
    aiModal: null,
    _abortController: null,
    _loadVersion: 0,
  })
})

describe('useEditorStore', () => {
  it('stato iniziale: currentText è una stringa vuota', () => {
    const { result } = renderHook(() => useCurrentText())
    expect(result.current).toBe('')
  })

  it('setCurrentText aggiorna currentText', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.setCurrentText('ciao mondo')
    })
    expect(result.current.currentText).toBe('ciao mondo')
  })

  it('reset riporta currentText a stringa vuota', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.setCurrentText('testo modificato')
    })
    act(() => {
      result.current.reset()
    })
    expect(result.current.currentText).toBe('')
  })
})

describe('useEditorStore — loadDocument', () => {
  it('aggiorna currentText come setCurrentText', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.loadDocument('nota caricata')
    })
    expect(result.current.currentText).toBe('nota caricata')
  })

  it('incrementa _loadVersion a ogni caricamento con testo diverso', () => {
    const { result } = renderHook(() => useEditorStore())
    expect(result.current._loadVersion).toBe(0)
    act(() => {
      result.current.loadDocument('nota A')
    })
    expect(result.current._loadVersion).toBe(1)
    act(() => {
      result.current.loadDocument('nota B')
    })
    expect(result.current._loadVersion).toBe(2)
  })

  it('non incrementa _loadVersion se il testo è identico a quello corrente', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.loadDocument('stesso testo')
    })
    expect(result.current._loadVersion).toBe(1)
    act(() => {
      result.current.loadDocument('stesso testo')
    })
    // Senza questa guardia in loadDocument, Editor.tsx scambierebbe la
    // prossima modifica reale per un caricamento (vedi #24, caso limite).
    expect(result.current._loadVersion).toBe(1)
  })

  it('setCurrentText non tocca _loadVersion (percorso digitazione utente)', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.setCurrentText('digitato dall\'utente')
    })
    expect(result.current._loadVersion).toBe(0)
  })
})

describe('useEditorStore — slice streaming', () => {
  it('startStreaming inizializza: isGenerating a true, streamedOutput vuoto', () => {
    const { result } = renderHook(() => useEditorStore())
    // sporco lo stato per dimostrare che startStreaming azzera l'output
    act(() => {
      result.current.appendChunk('residuo precedente')
    })
    act(() => {
      result.current.startStreaming()
    })
    expect(result.current.isGenerating).toBe(true)
    expect(result.current.streamedOutput).toBe('')
  })

  it('finishStreaming spegne isGenerating', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.startStreaming()
    })
    act(() => {
      result.current.finishStreaming()
    })
    expect(result.current.isGenerating).toBe(false)
  })

  it('appendChunk consecutivi concatenano senza perdere dati (callback form)', () => {
    const { result } = renderHook(() => useEditorStore())
    // due chiamate nello stesso act, senza re-render intermedio: la forma a
    // callback legge sempre lo stato più recente, quindi nessun chunk va perso
    act(() => {
      result.current.appendChunk('a')
      result.current.appendChunk('b')
    })
    expect(result.current.streamedOutput).toBe('ab')
  })

  it('useStreamedOutput e useIsGenerating riflettono lo stato corrente', () => {
    const output = renderHook(() => useStreamedOutput())
    const generating = renderHook(() => useIsGenerating())
    act(() => {
      useEditorStore.getState().startStreaming()
      useEditorStore.getState().appendChunk('ciao')
    })
    expect(output.result.current).toBe('ciao')
    expect(generating.result.current).toBe(true)
  })
})

describe('useEditorStore — slice error', () => {
  it('stato iniziale: errorMessage è null', () => {
    const { result } = renderHook(() => useErrorMessage())
    expect(result.current).toBeNull()
  })

  it('setError aggiorna il messaggio e spegne isGenerating', () => {
    const { result } = renderHook(() => useEditorStore())
    // simulo una generazione in corso che viene interrotta da un errore
    act(() => {
      result.current.startStreaming()
    })
    act(() => {
      result.current.setError('Servizio temporaneamente non disponibile')
    })
    expect(result.current.errorMessage).toBe(
      'Servizio temporaneamente non disponibile',
    )
    expect(result.current.isGenerating).toBe(false)
  })

  it('clearError riporta errorMessage a null', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.setError('errore qualsiasi')
    })
    act(() => {
      result.current.clearError()
    })
    expect(result.current.errorMessage).toBeNull()
  })
})

describe('useEditorStore — insertOutputIntoNote', () => {
  it('no-op se streamedOutput e vuoto', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.setCurrentText('testo originale')
    })
    act(() => {
      result.current.insertOutputIntoNote('replace')
    })
    expect(result.current.currentText).toBe('testo originale')
  })

  describe('azione "genera": accoda contenuto nuovo', () => {
    it('senza selezione: accoda con separatore \\n\\n', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'generate' })
        result.current.setCurrentText('testo originale')
        result.current.appendChunk('contenuto generato')
      })
      act(() => {
        result.current.insertOutputIntoNote('append')
      })
      expect(result.current.currentText).toBe(
        'testo originale\n\ncontenuto generato',
      )
      expect(result.current.streamedOutput).toBe('')
      expect(result.current.aiModal).toBeNull()
    })

    it('currentText vuoto: scrive output senza separatore', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'generate' })
        result.current.appendChunk('solo output')
      })
      act(() => {
        result.current.insertOutputIntoNote('append')
      })
      expect(result.current.currentText).toBe('solo output')
    })

    it('currentText finisce con newline: nessun separatore extra', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'generate' })
        result.current.setCurrentText('riga uno\n')
        result.current.appendChunk('riga due')
      })
      act(() => {
        result.current.insertOutputIntoNote('append')
      })
      expect(result.current.currentText).toBe('riga uno\nriga due')
    })

    it('accoda anche se esiste una selezione (ignora il sorgente)', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'generate' })
        result.current.setCurrentText('prima parola dopo')
        useEditorStore.setState({ selectedText: 'parola' })
        result.current.appendChunk('contenuto nuovo')
      })
      act(() => {
        result.current.insertOutputIntoNote('append')
      })
      expect(result.current.currentText).toBe(
        'prima parola dopo\n\ncontenuto nuovo',
      )
    })

    it('trimma whitespace iniziale e finale dello streamedOutput', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'generate' })
        result.current.setCurrentText('base')
        result.current.appendChunk('\n\n  output  \n')
      })
      act(() => {
        result.current.insertOutputIntoNote('append')
      })
      expect(result.current.currentText).toBe('base\n\noutput')
    })
  })

  describe('azione "riassumi": sostituisce il sorgente', () => {
    it('con selezione: sostituisce la sottostringa selezionata', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'summarize' })
        result.current.setCurrentText('prima [DA RIMPIAZZARE] dopo')
        useEditorStore.setState({ selectedText: '[DA RIMPIAZZARE]' })
        result.current.appendChunk('nuovo')
      })
      act(() => {
        result.current.insertOutputIntoNote('replace')
      })
      expect(result.current.currentText).toBe('prima nuovo dopo')
      expect(result.current.streamedOutput).toBe('')
      expect(useEditorStore.getState().selectedText).toBe('')
      expect(result.current.aiModal).toBeNull()
    })

    it('senza selezione: il riassunto sostituisce l\'intera nota', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'summarize' })
        result.current.setCurrentText('testo lungo originale della nota')
        result.current.appendChunk('riassunto')
      })
      act(() => {
        result.current.insertOutputIntoNote('replace')
      })
      expect(result.current.currentText).toBe('riassunto')
      expect(result.current.streamedOutput).toBe('')
      expect(result.current.aiModal).toBeNull()
    })

    it('selezione non trovata nel testo: sostituisce l\'intera nota', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'summarize' })
        result.current.setCurrentText('testo corrente')
        useEditorStore.setState({ selectedText: 'qualcosa che non esiste' })
        result.current.appendChunk('riassunto')
      })
      act(() => {
        result.current.insertOutputIntoNote('replace')
      })
      expect(result.current.currentText).toBe('riassunto')
    })

    it('chiude la modale aiModal a null dopo inserimento', () => {
      const { result } = renderHook(() => useEditorStore())
      act(() => {
        useEditorStore.setState({ aiModal: 'summarize' })
        result.current.appendChunk('out')
      })
      act(() => {
        result.current.insertOutputIntoNote('replace')
      })
      expect(result.current.aiModal).toBeNull()
    })
  })
})

describe('useEditorStore — discardOutput', () => {
  it('azzera streamedOutput, errorMessage e chiude la modale', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      useEditorStore.setState({
        streamedOutput: 'output parziale',
        errorMessage: 'qualcosa e andato storto',
        aiModal: 'summarize',
      })
    })
    act(() => {
      result.current.discardOutput()
    })
    expect(result.current.streamedOutput).toBe('')
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.aiModal).toBeNull()
  })

  it('non modifica currentText ne selectedText', () => {
    const { result } = renderHook(() => useEditorStore())
    act(() => {
      result.current.setCurrentText('nota intatta')
      useEditorStore.setState({ selectedText: 'parola' })
      result.current.appendChunk('output')
    })
    act(() => {
      result.current.discardOutput()
    })
    expect(result.current.currentText).toBe('nota intatta')
    expect(useEditorStore.getState().selectedText).toBe('parola')
  })
})

describe('useEditorStore — abortStream', () => {
  it('abortStream chiama abort sul controller e lo azzera', () => {
    const controller = new AbortController()
    const abortSpy = vi.spyOn(controller, 'abort')

    act(() => {
      useEditorStore.setState({ _abortController: controller })
    })

    act(() => {
      useEditorStore.getState().abortStream()
    })

    expect(abortSpy).toHaveBeenCalledTimes(1)
    expect(useEditorStore.getState()._abortController).toBeNull()
  })

  it('abortStream con controller null non lancia errori', () => {
    expect(() => {
      act(() => {
        useEditorStore.getState().abortStream()
      })
    }).not.toThrow()
  })
})

describe('useEditorStore — abortStream (UC71 / R-109-F-De)', () => {
  it('annulla il controller e spegne subito l indicatore di attesa', () => {
    const controller = new AbortController()

    act(() => {
      useEditorStore.setState({ _abortController: controller, isGenerating: true })
    })

    act(() => {
      useEditorStore.getState().abortStream()
    })

    expect(controller.signal.aborted).toBe(true)
    expect(useEditorStore.getState().isGenerating).toBe(false)
    expect(useEditorStore.getState()._abortController).toBeNull()
  })

  it('e innocuo quando non c e nulla da annullare', () => {
    act(() => {
      useEditorStore.setState({ _abortController: null, isGenerating: false })
    })

    expect(() => {
      act(() => {
        useEditorStore.getState().abortStream()
      })
    }).not.toThrow()
    expect(useEditorStore.getState().isGenerating).toBe(false)
  })
})

describe('useEditorStore — resetPreview', () => {
  it('azzera anteprima ed errore della richiesta precedente', () => {
    act(() => {
      useEditorStore.setState({
        streamedOutput: 'la traduzione in inglese di prima',
        errorMessage: 'errore della richiesta precedente',
      })
    })

    act(() => {
      useEditorStore.getState().resetPreview()
    })

    expect(useEditorStore.getState().streamedOutput).toBe('')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })

  it('annulla la richiesta in corso prima di azzerare (UC71)', () => {
    const controller = new AbortController()

    act(() => {
      useEditorStore.setState({
        _abortController: controller,
        isGenerating: true,
        streamedOutput: 'meta della traduzione in inglese',
      })
    })

    act(() => {
      useEditorStore.getState().resetPreview()
    })

    expect(controller.signal.aborted).toBe(true)
    expect(useEditorStore.getState().isGenerating).toBe(false)
    expect(useEditorStore.getState()._abortController).toBeNull()
    expect(useEditorStore.getState().streamedOutput).toBe('')
  })

  it('non tocca il testo della nota ne la selezione', () => {
    act(() => {
      useEditorStore.setState({
        currentText: 'nota intatta',
        selectedText: 'parola',
        streamedOutput: 'output da scartare',
      })
    })

    act(() => {
      useEditorStore.getState().resetPreview()
    })

    expect(useEditorStore.getState().currentText).toBe('nota intatta')
    expect(useEditorStore.getState().selectedText).toBe('parola')
  })

  it('e innocuo quando non c e nulla da azzerare', () => {
    expect(() => {
      act(() => {
        useEditorStore.getState().resetPreview()
      })
    }).not.toThrow()
  })
})
