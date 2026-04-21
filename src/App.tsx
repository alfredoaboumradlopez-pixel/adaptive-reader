import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import * as d3 from 'd3';
import { ai } from '@/lib/gemini';
import { BookOpen, Mic, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Sparkles, UploadCloud, Network, Library, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Initialize PDF.js worker using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// --- Types ---
type Sprint = {
  id: string;
  text: string;
};

type Chapter = {
  id: string;
  title: string;
  sprints: Sprint[];
  goldenThread: string;
  supportingContext: string;
  tags: string[];
};

type Book = {
  id: string;
  title: string;
  chapters: Chapter[];
  dateAdded: string;
};

type EmpireNode = {
  id: string;
  bookTitle: string;
  chapterTitle: string;
  goldenThread: string;
  dateAdded: string;
  tags: string[];
  sprintCount: number;
  masteryStatus: 'red' | 'yellow' | 'green';
};

type AppState = 'library' | 'toc' | 'upload' | 'reading' | 'gatekeeper' | 'feynman' | 'empire' | 'honing' | 'summon' | 'node_detail';

// --- Graph Components ---
const ForceGraph = ({ nodes, onNodeClick }: { nodes: EmpireNode[], onNodeClick: (node: EmpireNode) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;

    // Clear old graph
    d3.select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth;
    const height = 500;

    // Build Graph Data
    // Nodes
    const graphNodes = nodes.map(n => ({
      ...n,
      group: n.bookTitle,
      radius: Math.max(15, (n.sprintCount || 5) * 5),
    }));

    // Links (cross-pollination based on shared tags)
    const graphLinks: any[] = [];
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const sharedTags = graphNodes[i].tags?.filter(t => graphNodes[j].tags?.includes(t)) || [];
        if (sharedTags.length > 0) {
          graphLinks.push({
            source: graphNodes[i].id,
            target: graphNodes[j].id,
            value: sharedTags.length
          });
        }
      }
    }

    const simulation = d3.forceSimulation(graphNodes as any)
      .force('link', d3.forceLink(graphLinks).id((d: any) => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 10).iterations(2));

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background-color', '#fff')
      .style('border-radius', '16px')
      .style('border', '1px solid #e4e4e7');

    // Add connecting lines
    const link = svg.append('g')
      .attr('stroke', '#e4e4e7')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(graphLinks)
      .join('line')
      .attr('stroke-width', (d: any) => Math.sqrt(d.value));

    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', '#18181b')
      .style('color', '#fff')
      .style('padding', '8px 12px')
      .style('border-radius', '8px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', 10);

    // Add nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(graphNodes)
      .join('circle')
      .attr('r', (d: any) => d.radius)
      .attr('fill', (d: any) => {
        if (d.masteryStatus === 'red') return '#ef4444'; // red-500
        if (d.masteryStatus === 'yellow') return '#eab308'; // yellow-500
        return '#22c55e'; // green-500 (default)
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d: any) => {
        tooltip.style('visibility', 'visible')
          .html(`<strong>${d.bookTitle}</strong><br/>${d.chapterTitle}<br/><span style="color:#a1a1aa">Tags: ${d.tags?.join(', ') || 'None'}</span>`);
      })
      .on('mousemove', (event) => {
        const [x, y] = d3.pointer(event, containerRef.current);
        tooltip.style('top', (y - 10) + 'px').style('left', (x + 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('visibility', 'hidden');
      })
      .on('click', (event, d: any) => {
        onNodeClick(d as EmpireNode);
      });

    // Add text labels
    const labels = svg.append('g')
      .selectAll('text')
      .data(graphNodes)
      .join('text')
      .text((d: any) => d.chapterTitle.substring(0, 15) + '...')
      .attr('font-size', '10px')
      .attr('fill', '#fff')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .style('pointer-events', 'none')
      .style('text-shadow', '0px 1px 2px rgba(0,0,0,0.5)');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x = Math.max(d.radius, Math.min(width - d.radius, d.x)))
        .attr('cy', (d: any) => d.y = Math.max(d.radius, Math.min(height - d.radius, d.y)));

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    // Drag behavior
    const drag = d3.drag<SVGCircleElement, any>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [nodes]);

  return <div ref={containerRef} className="w-full relative shadow-sm rounded-2xl" />;
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('library');
  
  // Library State
  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [isEditingLibrary, setIsEditingLibrary] = useState(false);

  // Reading State
  const [bookTitle, setBookTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentSprintIndex, setCurrentSprintIndex] = useState(0);
  const [maxSprintReached, setMaxSprintReached] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Gatekeeper State
  const [userExplanation, setUserExplanation] = useState('');
  const [gatekeeperFeedback, setGatekeeperFeedback] = useState<{ pass: boolean; feedback: string } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const [chapterFailures, setChapterFailures] = useState(0);

  // Feynman State
  const [feynmanAnalogy, setFeynmanAnalogy] = useState('');
  const [isGeneratingAnalogy, setIsGeneratingAnalogy] = useState(false);

  // Paced Delivery State
  const [isPacedDelay, setIsPacedDelay] = useState(false);

  // Empire / Mastery Graph State
  const [empireNodes, setEmpireNodes] = useState<EmpireNode[]>([]);
  const [activeNode, setActiveNode] = useState<EmpireNode | null>(null);
  const [honingChat, setHoningChat] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [summonQuery, setSummonQuery] = useState('');
  const [summonResult, setSummonResult] = useState('');
  const [isSummoning, setIsSummoning] = useState(false);

  // Load Empire from LocalStorage on mount
  useEffect(() => {
    const savedEmpire = localStorage.getItem('adaptive_reader_empire');
    if (savedEmpire) {
      setEmpireNodes(JSON.parse(savedEmpire));
    }
    const savedLibrary = localStorage.getItem('adaptive_reader_library');
    if (savedLibrary) {
      setLibraryBooks(JSON.parse(savedLibrary));
    }
  }, []);

  // Paced Delivery Effect
  useEffect(() => {
    if (appState === 'reading') {
      setIsPacedDelay(true);
      const timer = setTimeout(() => setIsPacedDelay(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [currentSprintIndex, appState]);

  // --- Logic: Library Management ---
  const handleDeleteBook = (bookId: string) => {
    const updatedLibrary = libraryBooks.filter(b => b.id !== bookId);
    setLibraryBooks(updatedLibrary);
    localStorage.setItem('adaptive_reader_library', JSON.stringify(updatedLibrary));
    
    const bookToDelete = libraryBooks.find(b => b.id === bookId);
    if (bookToDelete) {
      const updatedEmpire = empireNodes.filter(n => n.bookTitle !== bookToDelete.title);
      setEmpireNodes(updatedEmpire);
      localStorage.setItem('adaptive_reader_empire', JSON.stringify(updatedEmpire));
    }
    
    if (updatedLibrary.length === 0) {
      setIsEditingLibrary(false);
    }
  };

  // --- Logic: PDF Upload & Parsing ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBookTitle(file.name.replace('.pdf', '').replace('.txt', ''));
    setUploadProgress('Extracting text...');
    setIsProcessing(true);

    try {
      let extractedText = '';
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const pagesToExtract = pdf.numPages; 
        for (let i = 1; i <= pagesToExtract; i++) {
          if (i === 1 || i % 5 === 0) {
            setUploadProgress(`Reading page ${i} of ${pagesToExtract}...`);
          }
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          extractedText += pageText + '\n\n';
        }
      } else {
        extractedText = await file.text();
      }

      setRawText(extractedText);
      setUploadProgress('Text extracted! Ready to structure chapters.');
    } catch (error) {
      console.error("Error reading file:", error);
      setUploadProgress('Error reading file. Please try a different one.');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Logic: Scanner & Chunk Layer ---
  const handleGenerateChapters = async () => {
    if (!rawText) return;
    setIsProcessing(true);
    setUploadProgress('AI is filtering noise and structuring chapters...');
    
    try {
      const prompt = `
        You are an expert editor and learning architect. I am providing you with the raw extracted text of a book.
        
        CRITICAL INSTRUCTIONS:
        1. Identify all the core chapters in the text. Ignore table of contents, copyright pages, dedications, indices, questions, and exercises.
        2. For each chapter, provide:
           - "title": The chapter title. CRITICAL: Remove any leading numbers or "Chapter X" prefixes from the title (e.g., "1 THE CHALLENGE" -> "THE CHALLENGE").
           - "goldenThread": The core thesis (max 15 words).
           - "supportingContext": 1-2 sentences of context.
           - "tags": An array of 1 to 3 string tags representing the high-level semantic topics of the chapter (e.g., "leadership", "psychology", "finance").
           - "sprints": An array of 4 to 8 strings representing the text of the chapter broken down into sequential reading sprints. These sprints MUST read like the actual book, maintaining the author's narrative flow, build-up, and tone, but distilled to be quicker and clearer. Do not just list abstract insights; tell the story of the chapter. Start with the narrative build-up and smoothly transition into the core concepts. Each sprint should be engaging, immersive, and around 100-200 words. Exclude any filler, questions, or exercises.
        
        Respond ONLY with a JSON array of objects matching this structure:
        [
          {
            "title": "THE CHALLENGE OF THE FUTURE",
            "goldenThread": "...",
            "supportingContext": "...",
            "tags": ["strategy", "leadership"],
            "sprints": [
              "Sprint 1 text...",
              "Sprint 2 text..."
            ]
          }
        ]

        Raw Text:
        ${rawText}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      if (response.text) {
        const aiChapters = JSON.parse(response.text);
        
        if (aiChapters.length === 0) throw new Error("Could not match chapters to text.");

        const generatedChapters: Chapter[] = aiChapters.map((ch: any) => {
          const sprints: Sprint[] = (ch.sprints || []).map((text: string) => ({
            id: Math.random().toString(36).substring(7),
            text: text
          }));

          return {
            id: Math.random().toString(36).substring(7),
            title: ch.title,
            goldenThread: ch.goldenThread,
            supportingContext: ch.supportingContext,
            tags: ch.tags || [],
            sprints: sprints.length > 0 ? sprints : [{ id: 's1', text: "No content found." }]
          };
        });

        if (generatedChapters.length > 0) {
          const newBook: Book = {
            id: Math.random().toString(36).substring(7),
            title: bookTitle || 'Unknown Text',
            chapters: generatedChapters,
            dateAdded: new Date().toISOString()
          };
          
          const updatedLibrary = [newBook, ...libraryBooks];
          setLibraryBooks(updatedLibrary);
          localStorage.setItem('adaptive_reader_library', JSON.stringify(updatedLibrary));
          
          setCurrentBook(newBook);
          setChapters(generatedChapters);
          setAppState('toc');
        } else {
          throw new Error("No chapters generated");
        }
      }
    } catch (error) {
      console.error("Error processing text:", error);
      setUploadProgress('Error structuring text. Please try a different file.');
    } finally {
      setIsProcessing(false);
      setUploadProgress('');
    }
  };

  // --- Logic: Active Retrieval Gatekeeper ---
  const handleEvaluateExplanation = async () => {
    if (!userExplanation.trim()) return;
    
    setIsEvaluating(true);
    try {
      const currentChapter = chapters[currentChapterIndex];
      const prompt = `
        You are an expert academic tutor. 
        The core concept (Golden Thread) of this chapter the student needs to understand is: "${currentChapter.goldenThread}"
        The supporting context is: "${currentChapter.supportingContext}"
        
        The student's explanation is: "${userExplanation}"
        
        Does the student's explanation demonstrate a core understanding of the chapter's Golden Thread or the material covered so far? 
        They do not need to use exact words, but the meaning must be accurate.
        
        Return a JSON object with two fields:
        1. "pass": boolean (true if they understand, false if they missed the core point)
        2. "feedback": string (If pass is true, give a brief encouraging word. If pass is false, provide a 1-sentence hint that guides them without revealing the direct answer.)
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      if (response.text) {
         const result = JSON.parse(response.text);
         setGatekeeperFeedback(result);
         
         if (!result.pass) {
           setFailureCount(prev => prev + 1);
           setChapterFailures(prev => prev + 1);
           if (failureCount + 1 >= 2) handleTriggerFeynman();
         }
      }
    } catch (error) {
      setGatekeeperFeedback({ pass: true, feedback: "Excellent synthesis. You've grasped the core concept." });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNextSprint = () => {
    const currentChapter = chapters[currentChapterIndex];
    const nextIndex = currentSprintIndex + 1;
    
    // Trigger Gatekeeper every 6 sprints OR at the end of the chapter
    const isRetrievalGate = nextIndex % 6 === 0 && nextIndex < currentChapter.sprints.length;
    
    if (isRetrievalGate && nextIndex > maxSprintReached) {
      setAppState('gatekeeper');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (currentSprintIndex < currentChapter.sprints.length - 1) {
      setCurrentSprintIndex(nextIndex);
      setMaxSprintReached(prev => Math.max(prev, nextIndex));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setAppState('gatekeeper');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGatekeeperSuccess = () => {
    const currentChapter = chapters[currentChapterIndex];
    if (currentSprintIndex < currentChapter.sprints.length - 1) {
      // Mid-chapter gatekeeper passed
      const nextIndex = currentSprintIndex + 1;
      setCurrentSprintIndex(nextIndex);
      setMaxSprintReached(prev => Math.max(prev, nextIndex));
      setAppState('reading');
      setUserExplanation('');
      setGatekeeperFeedback(null);
      setFailureCount(0);
      setFeynmanAnalogy('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // End-of-chapter gatekeeper passed
      handleNextChapter();
    }
  };

  const handleNextChapter = () => {
    const currentChapter = chapters[currentChapterIndex];
    
    let mStatus: 'green' | 'yellow' | 'red' = 'green';
    if (chapterFailures === 1) mStatus = 'yellow';
    if (chapterFailures > 1) mStatus = 'red';

    // Add to empire immediately upon finishing chapter
    const newNode: EmpireNode = {
      id: Math.random().toString(36).substring(7),
      bookTitle: currentBook?.title || bookTitle || 'Unknown Text',
      chapterTitle: currentChapter.title,
      goldenThread: currentChapter.goldenThread,
      dateAdded: new Date().toISOString(),
      tags: currentChapter.tags || [],
      sprintCount: currentChapter.sprints.length,
      masteryStatus: mStatus
    };
    
    const updatedEmpire = [newNode, ...empireNodes];
    setEmpireNodes(updatedEmpire);
    localStorage.setItem('adaptive_reader_empire', JSON.stringify(updatedEmpire));

    if (currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex(prev => prev + 1);
      setCurrentSprintIndex(0);
      setMaxSprintReached(0);
      setAppState('reading');
      setUserExplanation('');
      setGatekeeperFeedback(null);
      setFailureCount(0);
      setChapterFailures(0);
      setFeynmanAnalogy('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setAppState('toc');
      setChapterFailures(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // --- Logic: The Feynman Toggle ---
  const handleTriggerFeynman = async () => {
    setAppState('feynman');
    setIsGeneratingAnalogy(true);
    
    try {
      const currentChapter = chapters[currentChapterIndex];
      const prompt = `
        Explain this concept from the chapter: "${currentChapter.goldenThread}"
        Context: "${currentChapter.supportingContext}"
        Explain it using a highly relatable, modern analogy. Make it simple, engaging, and easy to visualize. Keep it under 3 sentences.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setFeynmanAnalogy(response.text || "Imagine your brain is a smartphone...");
    } catch (error) {
      setFeynmanAnalogy("Imagine your brain is a computer hard drive. Writing is like plugging in an external USB drive.");
    } finally {
      setIsGeneratingAnalogy(false);
    }
  };

  // --- Logic: Mastery Graph Actions ---
  const handleNodeClick = (node: EmpireNode) => {
    setActiveNode(node);
    setAppState('node_detail');
  };

  const startHoningSequence = () => {
    if (!activeNode) return;
    setAppState('honing');
    setHoningChat([{
      role: 'ai',
      content: `I see you had some friction with "${activeNode.chapterTitle}". Let's refine your setup. Can you explain the core idea of "${activeNode.goldenThread}" in your own words? Keep it simple.`
    }]);
  };

  const handleSocraticSubmit = async (text: string) => {
    if (!text.trim() || !activeNode) return;
    
    setHoningChat(prev => [...prev, { role: 'user', content: text }]);
    
    try {
      const prompt = `
        You are leading a Socratic Mastery Sprint. The user is trying to master this concept:
        "${activeNode.goldenThread}"
        
        The conversation history is:
        ${honingChat.map(c => `${c.role}: ${c.content}`).join('\n')}
        user: ${text}
        
        Is their understanding solid now? 
        If yes, respond with a final affirming sentence, starting with "MASTERY_ACHIEVED:".
        If no, ask ONE single, highly-focused Socratic question to guide them closer to the answer. Tone: brief, encouraging, intellectual.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const reply = response.text || "";
      if (reply.includes("MASTERY_ACHIEVED:")) {
        setHoningChat(prev => [...prev, { role: 'ai', content: reply.replace("MASTERY_ACHIEVED:", "").trim() }]);
        // Update nodes to turn this one green
        const updatedNodes = empireNodes.map(n => n.id === activeNode.id ? { ...n, masteryStatus: 'green' as const } : n);
        setEmpireNodes(updatedNodes);
        localStorage.setItem('adaptive_reader_empire', JSON.stringify(updatedNodes));
        
        // Update active node to reflect green so details page shows mastery
        setActiveNode(prev => prev ? { ...prev, masteryStatus: 'green' as const } : null);
        
        setTimeout(() => {
          setAppState('node_detail');
        }, 3000);
      } else {
        setHoningChat(prev => [...prev, { role: 'ai', content: reply.trim() }]);
      }
    } catch (error) {
      setHoningChat(prev => [...prev, { role: 'ai', content: "Network error, please try again." }]);
    }
  };

  const handleSummonContext = async () => {
    if (!summonQuery.trim()) return;
    setIsSummoning(true);
    setAppState('summon');
    
    try {
      const knowledgeContext = empireNodes.map(n => `- ${n.bookTitle} | ${n.chapterTitle}: ${n.goldenThread}`).join('\n');
      
      const prompt = `
        You are an elite cognitive synthesizer. 
        The user is asking to synthesize their extracted KNOWLEDGE for a specific real-world event/scenario:
        "${summonQuery}"
        
        Here is the user's uploaded knowledge base (Their Mastery Graph):
        ${knowledgeContext}
        
        Synthesize a highly actionable, 3-to-4 paragraph brief that weaves together only the relevant concepts from their knowledge to help them dominate this specific scenario.
        Act as a high-end advisory brief.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setSummonResult(response.text || "No synthesis available.");
    } catch (error) {
      setSummonResult("Error synthesizing knowledge. The network might be down.");
    } finally {
      setIsSummoning(false);
    }
  };

  const currentChapter = chapters[currentChapterIndex];
  const currentSprint = currentChapter?.sprints[currentSprintIndex];

  return (
    <div className="min-h-screen bg-[#FCFBFA] text-zinc-900 font-sans selection:bg-zinc-200">
      
      {/* Header */}
      <header className="fixed top-0 w-full bg-[#FCFBFA]/90 backdrop-blur-md border-b border-zinc-200/50 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 text-zinc-900 font-serif italic text-lg tracking-tight cursor-pointer"
            onClick={() => {
              setAppState('library');
            }}
          >
            <span>The Adaptive Reader</span>
          </div>
          
          <div className="flex items-center gap-8">
            {chapters.length > 0 && appState === 'reading' && (
              <div className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-400 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <span>Ch {currentChapterIndex + 1} / {chapters.length}</span>
                </div>
                
                <div className="flex items-center gap-3 pl-6 border-l border-zinc-200">
                  <div className="flex gap-1.5">
                    {currentChapter.sprints.map((_, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          if (idx <= maxSprintReached) {
                            setCurrentSprintIndex(idx);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className={cn(
                          "h-1 rounded-full transition-all duration-500",
                          idx <= maxSprintReached ? "cursor-pointer" : "",
                          idx === currentSprintIndex ? "w-6 bg-zinc-900" : 
                          idx <= maxSprintReached ? "w-3 bg-zinc-400 hover:bg-zinc-600" : "w-3 bg-zinc-200"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setAppState('library')}
                className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <Library className="w-3.5 h-3.5" />
                Library
              </button>
              <button 
                onClick={() => setAppState('empire')}
                className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <Network className="w-3.5 h-3.5" />
                Empire
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-32 max-w-3xl mx-auto px-6">
        <AnimatePresence mode="wait">
          
          {/* STATE: LIBRARY */}
          {appState === 'library' && (
            <motion.div 
              key="library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center justify-between mb-16 border-b border-zinc-200 pb-8">
                <div>
                  <h1 className="text-4xl font-serif text-zinc-900 mb-3">Your Library</h1>
                  <p className="text-zinc-500 font-light">Texts you are currently extracting knowledge from.</p>
                </div>
                <div className="flex items-center gap-3">
                  {libraryBooks.length > 0 && (
                    <button 
                      onClick={() => setIsEditingLibrary(!isEditingLibrary)}
                      className="text-zinc-500 hover:text-zinc-900 px-4 py-3 rounded-full font-medium text-sm transition-colors"
                    >
                      {isEditingLibrary ? 'Done' : 'Edit'}
                    </button>
                  )}
                  <button 
                    onClick={() => setAppState('upload')}
                    className="bg-zinc-900 text-white px-6 py-3 rounded-full font-medium text-sm flex items-center gap-2 hover:bg-zinc-800 transition-colors"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Add Text
                  </button>
                </div>
              </div>

              {libraryBooks.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200 border-dashed">
                  <Library className="w-10 h-10 text-zinc-300 mx-auto mb-6 stroke-[1.5]" />
                  <h3 className="text-xl font-serif text-zinc-900 mb-2">Your library is empty</h3>
                  <p className="text-zinc-500 mb-8 font-light">Upload a text to begin reading and extracting knowledge.</p>
                  <button 
                    onClick={() => setAppState('upload')}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-8 rounded-full font-medium transition-all"
                  >
                    Upload Text
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {libraryBooks.map(book => (
                    <div 
                      key={book.id} 
                      onClick={() => {
                        if (isEditingLibrary) return;
                        setCurrentBook(book);
                        setChapters(book.chapters);
                        setAppState('toc');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer group relative"
                    >
                      {isEditingLibrary && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBook(book.id);
                          }}
                          className="absolute top-4 right-4 p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors z-10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-zinc-100 transition-colors">
                        <BookOpen className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                      </div>
                      <h3 className="font-serif text-xl font-medium text-zinc-900 mb-2 line-clamp-2">{book.title}</h3>
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mt-4">
                        {book.chapters.length} Chapters
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* STATE: TOC */}
          {appState === 'toc' && currentBook && (
            <motion.div 
              key="toc"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto"
            >
              <button 
                onClick={() => setAppState('library')}
                className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-900 transition-colors mb-12"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Library
              </button>
              
              <div className="mb-12">
                <h1 className="text-4xl md:text-5xl font-serif text-zinc-900 mb-4">{currentBook.title}</h1>
                <p className="text-zinc-500 font-light">Select a chapter to begin your cognitive sprint.</p>
              </div>

              <div className="space-y-4">
                {currentBook.chapters.map((chapter, idx) => {
                  const isMastered = empireNodes.some(n => n.bookTitle === currentBook.title && n.chapterTitle === chapter.title);
                  return (
                    <div 
                      key={chapter.id}
                      onClick={() => {
                        setCurrentChapterIndex(idx);
                        setCurrentSprintIndex(0);
                        setMaxSprintReached(0);
                        setAppState('reading');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                          isMastered ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200"
                        )}>
                          {isMastered ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>
                        <h3 className="font-serif text-lg text-zinc-900">{chapter.title}</h3>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STATE: UPLOAD */}
          {appState === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-12"
            >
              <div className="text-center mb-16">
                <h1 className="text-5xl md:text-6xl font-serif text-zinc-900 mb-6 leading-tight">
                  Read Deeply.<br/>Remember Everything.
                </h1>
                <p className="text-lg text-zinc-500 max-w-md mx-auto font-light">
                  Upload a text. We structure it into focused cognitive sprints to build your Knowledge Empire.
                </p>
              </div>
              
              <div className="bg-white p-10 rounded-2xl border border-zinc-200 shadow-sm">
                
                {!rawText ? (
                  <div className="relative border border-dashed border-zinc-300 rounded-xl p-16 text-center hover:bg-zinc-50 hover:border-zinc-400 transition-all group cursor-pointer">
                    <input 
                      type="file" 
                      accept=".pdf,.txt" 
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center gap-4">
                      <div className="text-zinc-400 group-hover:text-zinc-900 transition-colors">
                        <UploadCloud className="w-8 h-8 stroke-[1.5]" />
                      </div>
                      <div>
                        <p className="text-base font-medium text-zinc-900">Select a PDF or Text file</p>
                        <p className="text-sm text-zinc-500 mt-1 font-light">Drag and drop, or click to browse</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center gap-4 p-4 bg-zinc-50 border border-zinc-100 rounded-xl text-zinc-800">
                      <CheckCircle2 className="w-5 h-5 text-zinc-900" />
                      <div>
                        <p className="font-medium text-sm">Document Parsed</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{rawText.length.toLocaleString()} characters extracted.</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">Document Title</label>
                      <input 
                        type="text"
                        value={bookTitle}
                        onChange={(e) => setBookTitle(e.target.value)}
                        className="w-full p-4 bg-transparent border-b border-zinc-300 focus:border-zinc-900 focus:outline-none text-xl font-serif transition-colors rounded-none px-0"
                        placeholder="e.g., Meditations"
                      />
                    </div>

                    <button 
                      onClick={handleGenerateChapters}
                      disabled={isProcessing || !bookTitle}
                      className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-4 px-6 rounded-xl font-medium transition-all disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                          <Sparkles className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <BookOpen className="w-4 h-4" />
                      )}
                      {isProcessing ? "Structuring Document..." : "Begin Reading"}
                    </button>
                  </div>
                )}

                {uploadProgress && (
                  <p className="text-center text-xs font-medium text-zinc-500 uppercase tracking-widest mt-6 animate-pulse">
                    {uploadProgress}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* STATE: READING */}
          {appState === 'reading' && currentSprint && (
            <motion.div 
              key="reading"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(10px)' }}
              className="max-w-2xl mx-auto pb-40"
            >
              <div className="mb-12 text-center">
                <h3 className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-4">{bookTitle}</h3>
                <h2 className="text-3xl md:text-4xl font-serif text-zinc-900 mb-8">{currentChapter.title}</h2>
                
                {/* Visual Anchor (Dual Coding) */}
                <div className="flex items-start gap-4 bg-zinc-100/50 p-5 rounded-2xl border border-zinc-200/50 text-left">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 mt-1">
                    <Network className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-2">Concept Anchor</p>
                    <p className="text-sm font-serif text-zinc-600 mb-2 leading-relaxed">{currentChapter.supportingContext}</p>
                    <p className="text-sm font-serif font-medium text-zinc-900 leading-relaxed"><span className="font-sans text-xs font-bold tracking-widest text-zinc-400 uppercase mr-2">The Golden Thread:</span>{currentChapter.goldenThread}</p>
                  </div>
                </div>
              </div>
              
              <div className="prose prose-lg max-w-none">
                <div className="font-serif text-xl md:text-2xl leading-loose text-zinc-800 whitespace-pre-wrap">
                  <Markdown>{currentSprint.text}</Markdown>
                </div>
              </div>
              
              <div className="fixed bottom-12 left-0 w-full px-6 pointer-events-none z-40">
                <div className="max-w-2xl mx-auto flex items-center justify-center relative pointer-events-auto">
                  {currentSprintIndex > 0 && (
                    <button 
                      onClick={() => {
                        setCurrentSprintIndex(prev => prev - 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="absolute left-0 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 font-medium transition-all py-4"
                    >
                      <ArrowLeft className="w-4 h-4" /> Previous
                    </button>
                  )}
                  <button 
                    onClick={handleNextSprint}
                    disabled={isPacedDelay && currentSprintIndex === maxSprintReached}
                    className={cn(
                      "flex items-center gap-3 py-4 px-10 rounded-full font-medium transition-all shadow-2xl shadow-zinc-900/20",
                      isPacedDelay && currentSprintIndex === maxSprintReached
                        ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                        : "bg-zinc-900 hover:bg-zinc-800 text-white hover:-translate-y-1"
                    )}
                  >
                    {currentSprintIndex < currentChapter.sprints.length - 1 ? (
                      <>Continue <ChevronRight className="w-4 h-4" /></>
                    ) : (
                      <>Synthesize Chapter <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE: GATEKEEPER */}
          {appState === 'gatekeeper' && currentChapter && (
            <motion.div 
              key="gatekeeper"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white rounded-2xl p-10 md:p-14 border border-zinc-200 shadow-sm">
                <div className="text-center mb-10">
                  <h3 className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-4">Active Retrieval</h3>
                  <h2 className="text-3xl font-serif text-zinc-900 mb-4">
                    {currentSprintIndex < currentChapter.sprints.length - 1 
                      ? "Active Retrieval Checkpoint" 
                      : `Synthesize ${currentChapter.title}`}
                  </h2>
                  <p className="text-zinc-500 font-light">
                    {currentSprintIndex < currentChapter.sprints.length - 1 
                      ? "Before unlocking the next section, briefly summarize what you've read so far."
                      : "In your own words, what is the core thesis of this chapter?"}
                  </p>
                </div>

                <div className="relative mb-8">
                  <textarea 
                    value={userExplanation}
                    onChange={(e) => setUserExplanation(e.target.value)}
                    placeholder="The author argues that..."
                    className="w-full h-48 p-6 bg-zinc-50/50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 resize-none text-lg font-serif text-zinc-800 placeholder:text-zinc-400 transition-all"
                  />
                  <button className="absolute bottom-4 right-4 p-3 bg-white border border-zinc-200 rounded-full text-zinc-400 hover:text-zinc-900 transition-colors shadow-sm">
                    <Mic className="w-4 h-4" />
                  </button>
                </div>

                {gatekeeperFeedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-6 rounded-xl mb-8 flex gap-4 border",
                      gatekeeperFeedback.pass ? "bg-zinc-50 border-zinc-200 text-zinc-900" : "bg-red-50 border-red-100 text-red-900"
                    )}
                  >
                    {gatekeeperFeedback.pass ? (
                      <CheckCircle2 className="w-5 h-5 text-zinc-900 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium text-sm uppercase tracking-widest mb-2">
                        {gatekeeperFeedback.pass ? "Mastery Confirmed" : "Refinement Needed"}
                      </p>
                      <p className="font-serif text-lg opacity-90">{gatekeeperFeedback.feedback}</p>
                    </div>
                  </motion.div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                  <button 
                    onClick={handleTriggerFeynman}
                    className="text-xs font-medium uppercase tracking-widest text-zinc-400 hover:text-zinc-900 flex items-center gap-2 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Simplify
                  </button>

                  {!gatekeeperFeedback?.pass ? (
                    <div className="flex items-center gap-3">
                      {failureCount >= 2 && (
                        <button 
                          onClick={handleGatekeeperSuccess}
                          className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 py-3 px-6 rounded-full font-medium transition-all"
                        >
                          Move On <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={handleEvaluateExplanation}
                        disabled={isEvaluating || !userExplanation.trim()}
                        className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-8 rounded-full font-medium transition-all disabled:opacity-50"
                      >
                        {isEvaluating ? "Evaluating..." : "Submit"}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGatekeeperSuccess}
                      className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-8 rounded-full font-medium transition-all"
                    >
                      {currentSprintIndex < currentChapter.sprints.length - 1 ? "Unlock Next Section" : "Enter Empire"} <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE: FEYNMAN TOGGLE */}
          {appState === 'feynman' && currentChapter && (
            <motion.div 
              key="feynman"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-zinc-900 rounded-2xl p-10 md:p-14 text-zinc-100 shadow-2xl">
                <div className="flex items-center gap-3 text-zinc-400 mb-10">
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-xs font-bold tracking-widest uppercase">The Feynman Toggle</h2>
                </div>

                {isGeneratingAnalogy ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-zinc-800 rounded w-3/4"></div>
                    <div className="h-4 bg-zinc-800 rounded"></div>
                    <div className="h-4 bg-zinc-800 rounded w-5/6"></div>
                  </div>
                ) : (
                  <>
                    <div className="font-serif text-2xl md:text-3xl leading-relaxed mb-12 text-white">
                      "{feynmanAnalogy}"
                    </div>
                    
                    <div className="border-t border-zinc-800 pt-8">
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-3">Original Thesis</p>
                      <p className="font-serif text-lg text-zinc-300">{currentChapter.goldenThread}</p>
                    </div>

                    <div className="mt-12 flex justify-end gap-4">
                      <button 
                        onClick={() => setAppState('gatekeeper')}
                        className="flex items-center gap-2 bg-zinc-800 text-white hover:bg-zinc-700 py-3 px-8 rounded-full font-medium transition-all"
                      >
                        Try Again
                      </button>
                      <button 
                        onClick={handleNextChapter}
                        className="flex items-center gap-2 bg-white text-zinc-900 hover:bg-zinc-100 py-3 px-8 rounded-full font-medium transition-all"
                      >
                        Move On <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* STATE: EMPIRE (Curriculum Dashboard) */}
          {appState === 'empire' && (
            <motion.div 
              key="empire"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-8 border-b border-zinc-200 pb-8">
                <div>
                  <h1 className="text-4xl font-serif text-zinc-900 mb-3">Knowledge Empire</h1>
                  <p className="text-zinc-500 font-light">Your cognitive architecture and mastered concepts.</p>
                </div>
                <div className="bg-zinc-100 text-zinc-900 px-4 py-2 rounded-full font-medium text-xs uppercase tracking-widest flex items-center gap-2">
                  <Network className="w-3.5 h-3.5" />
                  {empireNodes.length} Nodes Mastered
                </div>
              </div>

              {empireNodes.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200 border-dashed">
                  <Network className="w-10 h-10 text-zinc-300 mx-auto mb-6 stroke-[1.5]" />
                  <h3 className="text-xl font-serif text-zinc-900 mb-2">Your Empire is empty</h3>
                  <p className="text-zinc-500 mb-8 font-light">Upload a text to begin extracting knowledge.</p>
                  <button 
                    onClick={() => setAppState('upload')}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-8 rounded-full font-medium transition-all"
                  >
                    Upload Text
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-12">
                  
                  {/* Contextual Retrieval / Summon Feature */}
                  <div className="bg-zinc-900 rounded-2xl p-8 text-white shadow-xl">
                    <div className="flex items-center gap-2 text-zinc-400 font-bold tracking-widest text-xs uppercase mb-6">
                      <Sparkles className="w-4 h-4" /> Contextual Retrieval Protocol
                    </div>
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        value={summonQuery}
                        onChange={(e) => setSummonQuery(e.target.value)}
                        placeholder="e.g. Preparing for a negotiation about equity..."
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white"
                        onKeyDown={(e) => e.key === 'Enter' && handleSummonContext()}
                      />
                      <button 
                        onClick={handleSummonContext}
                        className="bg-white text-zinc-900 px-8 py-4 rounded-lg font-medium hover:bg-zinc-100 transition-colors shrink-0"
                      >
                        Summon
                      </button>
                    </div>
                  </div>

                  {/* Force Directed Graph */}
                  <div>
                    <h3 className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-4">Mastery Graph</h3>
                    <div className="h-[500px] border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <ForceGraph nodes={empireNodes} onNodeClick={handleNodeClick} />
                    </div>
                    <div className="flex gap-6 mt-4 text-xs font-medium text-zinc-500 justify-center">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Mastered (Solid)</div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Needs Polish</div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> Friction Point</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* STATE: SUMMON */}
          {appState === 'summon' && (
            <motion.div 
              key="summon"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-white border border-zinc-200 rounded-2xl p-10 md:p-14 shadow-sm">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-8 mb-8">
                  <div>
                    <h2 className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-2">Synthesis Brief</h2>
                    <h3 className="text-2xl font-serif text-zinc-900">"{summonQuery}"</h3>
                  </div>
                  <Sparkles className="w-6 h-6 text-zinc-300" />
                </div>

                {isSummoning ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-zinc-100 rounded w-full"></div>
                    <div className="h-4 bg-zinc-100 rounded w-[90%]"></div>
                    <div className="h-4 bg-zinc-100 rounded w-[95%]"></div>
                  </div>
                ) : (
                  <div className="prose prose-zinc max-w-none">
                    <Markdown>{summonResult}</Markdown>
                  </div>
                )}
                
                <div className="mt-12 text-center pt-8 border-t border-zinc-100">
                  <button 
                    onClick={() => { setAppState('empire'); setSummonQuery(''); }}
                    className="text-zinc-500 hover:text-zinc-900 font-medium text-sm transition-colors"
                  >
                    Return to Empire
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE: HONING SPRINT */}
          {appState === 'honing' && activeNode && (
            <motion.div 
              key="honing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="mb-12 text-center">
                <h3 className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-4">Socratic Mastery Sprint</h3>
                <h2 className="text-3xl font-serif text-zinc-900 mb-2">{activeNode.chapterTitle}</h2>
              </div>
              
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm mb-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-6 flex flex-col">
                  {honingChat.map((msg, i) => (
                    <div key={i} className={cn("max-w-[85%] p-4 rounded-2xl", msg.role === 'ai' ? "bg-zinc-50 border border-zinc-100 self-start text-zinc-800 rounded-tl-sm" : "bg-zinc-900 text-white self-end rounded-tr-sm")}>
                      <Markdown className="prose prose-sm prose-zinc">{msg.content}</Markdown>
                    </div>
                  ))}
                  {honingChat[honingChat.length - 1]?.role === 'user' && (
                    <div className="bg-zinc-50 border border-zinc-100 self-start text-zinc-400 rounded-2xl rounded-tl-sm p-4 w-16 flex justify-center animate-pulse">...</div>
                  )}
                </div>
              </div>
              
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Your response..."
                  className="w-full bg-white border border-zinc-200 rounded-full px-6 py-4 shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSocraticSubmit(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                  disabled={honingChat[honingChat.length - 1]?.role === 'user'}
                />
              </div>
              
              <div className="mt-8 text-center">
                <button 
                  onClick={() => { setAppState('node_detail'); }}
                  className="text-xs text-zinc-400 hover:text-zinc-900 font-bold tracking-widest uppercase transition-colors"
                >
                  Exit Sprint
                </button>
              </div>
            </motion.div>
          )}

          {/* STATE: NODE DETAIL */}
          {appState === 'node_detail' && activeNode && (
            <motion.div 
              key="node_detail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-white border border-zinc-200 rounded-2xl p-10 md:p-14 shadow-sm relative">
                <button 
                  onClick={() => { setAppState('empire'); setActiveNode(null); }}
                  className="absolute top-6 left-6 p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                
                <div className="mt-6 mb-8 border-b border-zinc-100 pb-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs font-bold tracking-widest text-zinc-400 uppercase mb-4">
                    <BookOpen className="w-3.5 h-3.5" /> Book: {activeNode.bookTitle}
                  </div>
                  <h3 className="text-3xl font-serif text-zinc-900 mb-4">{activeNode.chapterTitle}</h3>
                  <div className="flex justify-center gap-2 mt-2">
                     {activeNode.tags?.map(tag => (
                       <span key={tag} className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-medium uppercase tracking-widest">{tag}</span>
                     ))}
                  </div>
                </div>

                <div className="mb-10 text-center">
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">The Golden Thread (Core Thesis)</p>
                  <p className="font-serif text-2xl text-zinc-800 leading-relaxed max-w-2xl mx-auto">
                    "{activeNode.goldenThread}"
                  </p>
                </div>

                <div className="flex justify-center items-center gap-4 mt-10">
                  {activeNode.masteryStatus !== 'green' ? (
                    <div className="flex flex-col items-center">
                      <p className="text-sm text-yellow-600 font-medium mb-4 flex items-center gap-2">
                         <AlertCircle className="w-4 h-4"/> This concept needs refinement.
                      </p>
                      <button 
                        onClick={startHoningSequence}
                        className="bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-4 rounded-full font-medium transition-all shadow-sm flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" /> Begin Socratic Honing Sprint
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                       <p className="text-sm text-green-600 font-medium flex items-center gap-2 border border-green-100 bg-green-50 px-6 py-3 rounded-full">
                         <CheckCircle2 className="w-4 h-4"/> Mastery Achieved
                       </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
