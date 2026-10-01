import { describe, expect, it } from 'vitest'
import { parsePlainTextFileToStructure, parsePlainTextToStructure } from './plainTextImport.js'

describe('plain text manuscript import', () => {
  it('preserves explicit acts, chapters, scenes, and scene breaks from TXT', () => {
    const acts = parsePlainTextToStructure(`ACT I\n\nCHAPTER 1 — Arrival\n\nCara entered Moonfall.\n\n***\n\nCara returned.\n\nCHAPTER 2\n\nThe city woke.`)
    expect(acts).toHaveLength(1)
    expect(acts[0].title).toBe('ACT I')
    expect(acts[0].chapters.map(chapter => chapter.title)).toEqual(['CHAPTER 1 — Arrival', 'CHAPTER 2'])
    expect(acts[0].chapters[0].scenes.map(scene => scene.content)).toEqual(['Cara entered Moonfall.', 'Cara returned.'])
  })

  it('uses Markdown headings as manuscript structure', () => {
    const acts = parsePlainTextToStructure(`# Part One\n\n## Chapter One\n\n### The Gate\n\nCara entered Moonfall.`)
    expect(acts[0].title).toBe('Part One')
    expect(acts[0].chapters[0].title).toBe('Chapter One')
    expect(acts[0].chapters[0].scenes[0]).toMatchObject({ title: 'The Gate', content: 'Cara entered Moonfall.' })
  })

  it('recognises written-number chapter labels in plain text', () => {
    const acts = parsePlainTextToStructure('Chapter One — Home\n\nThe beginning.\n\nChapter Two\n\nThe return.')
    expect(acts[0].chapters.map(chapter => chapter.title)).toEqual(['Chapter One — Home', 'Chapter Two'])
  })

  it('recognises em-dash-decorated chapter markers without invoking title guessing', () => {
    const acts = parsePlainTextToStructure(`— CHAPTER ONE —\n\nThe Boy Who Lived\n\nFirst chapter prose.\n\n— CHAPTER TWO —\n\nThe Vanishing Glass\n\nSecond chapter prose.`)
    expect(acts[0].chapters.map(chapter => chapter.title)).toEqual([
      'CHAPTER ONE — The Boy Who Lived',
      'CHAPTER TWO — The Vanishing Glass',
    ])
    expect(acts[0].chapters.map(chapter => chapter.scenes[0].content)).toEqual([
      'First chapter prose.',
      'Second chapter prose.',
    ])
  })

  it('imports unstructured text into a safe default hierarchy', () => {
    const acts = parsePlainTextToStructure('Cara entered Moonfall.\n\nRia followed her.')
    expect(acts).toEqual([{ title: 'Act 1', chapters: [{ title: 'Chapter 1', scenes: [{ title: 'Scene', content: 'Cara entered Moonfall.\n\nRia followed her.' }] }] }])
  })

  it('reads a TXT File and rejects empty input', async () => {
    const file = { name: 'story.txt', size: 25, text: async () => 'Chapter 1\n\nThe beginning.' }
    await expect(parsePlainTextFileToStructure(file)).resolves.toBeTruthy()
    expect(() => parsePlainTextToStructure(' \n ')).toThrow(/No manuscript text/)
  })
})
