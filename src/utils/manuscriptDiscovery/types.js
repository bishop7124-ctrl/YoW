/**
 * JSDoc contracts are used because YOW's Vite application is JavaScript/JSX.
 * They keep the local engine's boundary explicit without adding a second
 * TypeScript build path to the repository.
 *
 * @typedef {'high'|'medium'|'low'} DiscoveryConfidence
 * @typedef {'character'|'location'|'faction'|'relationship'|'timeline'|'lore'|'outline'} DiscoveryType
 * @typedef {{manuscriptId:string, chapterId:string, chapterTitle:string, excerpt:string, start:number, end:number, reason:string}} DiscoveryEvidence
 * @typedef {{id:string, manuscriptId:string, actTitle:string, sourceActIndex:number, sourceChapterIndex:number, title:string, order:number, text:string, scenes:Array<{id:string,title:string,order:number,text:string,start:number,end:number}>, paragraphs:Array<{text:string,start:number,end:number}>, sentences:Array<{id:string,text:string,start:number,end:number,chapterId:string,chapterTitle:string}>, wordCount:number}} ManuscriptChapter
 * @typedef {{id:string, chapters:ManuscriptChapter[], wordCount:number}} ManuscriptDocument
 * @typedef {{id:string,type:DiscoveryType,name:string,confidence:DiscoveryConfidence,score:number,mentions:number,selected:boolean,evidence:DiscoveryEvidence[],sourceChapterIds:string[],reasons:string[]}} DiscoveryCandidate
 */

export {}
