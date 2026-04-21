(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/lib/knowledge-empire-data.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "knowledgeGraphData",
    ()=>knowledgeGraphData
]);
const knowledgeGraphData = {
    nodes: [
        {
            id: "z21_ch5",
            bookTitle: "Zero to One",
            chapter: "Chapter 5: Last Mover Advantage",
            goldenThread: "A proprietary technology must be 10x better than its closest substitute to create a true monopolistic advantage. In hospitality, your tech stack and standard operating procedures are your proprietary tech.",
            tags: [
                "Scale",
                "Leverage"
            ],
            masteryStatus: "Green",
            sprintCount: 8,
            color: "#10B981"
        },
        {
            id: "cost_ch3",
            bookTitle: "Principles of Cost Controls",
            chapter: "Chapter 3: Cost/Volume/Profit",
            goldenThread: "Volume is the engine of profit. Because fixed costs remain constant, increasing the number of covers directly accelerates the bottom-line profit margin once the break-even point is crossed.",
            tags: [
                "Scale",
                "Finance"
            ],
            masteryStatus: "Yellow",
            sprintCount: 6,
            color: "#F59E0B"
        },
        {
            id: "cost_ch1",
            bookTitle: "Principles of Cost Controls",
            chapter: "Chapter 1: Cost and Sales Concepts",
            goldenThread: "Prime Cost (Food + Beverage + Labor) is the ultimate metric of operational survival. If this exceeds 60-65%, the business model is structurally flawed regardless of sales volume.",
            tags: [
                "Finance",
                "Operations"
            ],
            masteryStatus: "Red",
            sprintCount: 4,
            color: "#EF4444"
        },
        {
            id: "z21_ch3",
            bookTitle: "Zero to One",
            chapter: "Chapter 3: All Happy Companies are Different",
            goldenThread: "Perfect competition destroys profit. The goal is to capture value by creating a category of one, rather than fighting over margins in a commoditized market.",
            tags: [
                "Leverage",
                "Finance"
            ],
            masteryStatus: "Green",
            sprintCount: 7,
            color: "#10B981"
        }
    ],
    links: [
        {
            source: "z21_ch5",
            target: "cost_ch3",
            label: "Scale crossover"
        },
        {
            source: "cost_ch3",
            target: "cost_ch1",
            label: "Finance crossover"
        },
        {
            source: "cost_ch3",
            target: "z21_ch3",
            label: "Finance/Leverage crossover"
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/knowledge-empire-graph.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KnowledgeEmpireGraph",
    ()=>KnowledgeEmpireGraph
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$force$2d$graph$2d$3d$2f$dist$2f$react$2d$force$2d$graph$2d$3d$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react-force-graph-3d/dist/react-force-graph-3d.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$knowledge$2d$empire$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/knowledge-empire-data.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function KnowledgeEmpireGraph({ onNodeClick }) {
    _s();
    const graphData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "KnowledgeEmpireGraph.useMemo[graphData]": ()=>{
            const nodes = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$knowledge$2d$empire$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["knowledgeGraphData"].nodes.map({
                "KnowledgeEmpireGraph.useMemo[graphData].nodes": (node)=>({
                        ...node,
                        val: Math.max(3, node.sprintCount * 1.8),
                        color: node.color
                    })
            }["KnowledgeEmpireGraph.useMemo[graphData].nodes"]);
            const links = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$knowledge$2d$empire$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["knowledgeGraphData"].links.map({
                "KnowledgeEmpireGraph.useMemo[graphData].links": (link)=>({
                        ...link
                    })
            }["KnowledgeEmpireGraph.useMemo[graphData].links"]);
            return {
                nodes,
                links
            };
        }
    }["KnowledgeEmpireGraph.useMemo[graphData]"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-screen w-screen bg-zinc-950",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$force$2d$graph$2d$3d$2f$dist$2f$react$2d$force$2d$graph$2d$3d$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                graphData: graphData,
                backgroundColor: "#09090b",
                nodeLabel: (node)=>{
                    const n = node;
                    return `${n.chapter}
Book: ${n.bookTitle}
Mastery: ${n.masteryStatus}
Sprints: ${n.sprintCount}
Golden Thread: ${n.goldenThread}`;
                },
                nodeColor: (node)=>node.color,
                nodeVal: (node)=>node.val,
                linkColor: ()=>"#3f3f46",
                linkDirectionalParticles: 2,
                linkDirectionalParticleSpeed: 0.004,
                linkDirectionalParticleWidth: 1.3,
                linkDirectionalParticleColor: ()=>"#a1a1aa",
                linkLabel: (link)=>link.label,
                onNodeClick: (node)=>onNodeClick?.(node)
            }, void 0, false, {
                fileName: "[project]/components/knowledge-empire-graph.tsx",
                lineNumber: 30,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute left-6 top-6 max-w-xl rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-zinc-100 backdrop-blur",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-xl font-semibold tracking-tight",
                        children: "Knowledge Empire"
                    }, void 0, false, {
                        fileName: "[project]/components/knowledge-empire-graph.tsx",
                        lineNumber: 53,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-sm text-zinc-300",
                        children: "Mastery Graph seeded from your two active books. Node color follows the Traffic Light protocol, node size maps to sprint volume, and links represent shared semantic threads like Efficiency and Scale."
                    }, void 0, false, {
                        fileName: "[project]/components/knowledge-empire-graph.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/knowledge-empire-graph.tsx",
                lineNumber: 52,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/knowledge-empire-graph.tsx",
        lineNumber: 29,
        columnNumber: 5
    }, this);
}
_s(KnowledgeEmpireGraph, "kvQIHlg/C1s+v9HX4nbruhDlITo=");
_c = KnowledgeEmpireGraph;
var _c;
__turbopack_context__.k.register(_c, "KnowledgeEmpireGraph");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/knowledge-empire-graph.tsx [app-client] (ecmascript, next/dynamic entry)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/components/knowledge-empire-graph.tsx [app-client] (ecmascript)"));
}),
]);

//# sourceMappingURL=_0cpv0zq._.js.map