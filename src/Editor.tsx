import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  $isTextNode,
  GridSelection,
  NodeSelection,
  RangeSelection,
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_LOW,
  TextFormatType,
  LexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { $isAtNodeEnd } from "@lexical/selection";
import { TreeView } from "@lexical/react/LexicalTreeView";
import { LinkNode } from "@lexical/link";

const theme = {};

enum CaretType {
  MIDDLE = "middle",
  LEFT = "left",
  RIGHT = "right",
}

const TEXT_FORMATS: TextFormatType[] = [
  "bold",
  "underline",
  "strikethrough",
  "italic",
  "highlight",
  "code",
  "subscript",
  "superscript",
];

enum CaretPosition {
  NODE_END = "node_end",
  NODE_START = "node_start",
  NODE_NOT_FOUND = "node_not_found",
}

type CollapsedSelectionPosition =
  | {
      position: Exclude<CaretPosition, CaretPosition.NODE_NOT_FOUND>;
      node: LexicalNode;
    }
  | {
      position: CaretPosition.NODE_NOT_FOUND;
      node: LexicalNode | null;
    };

enum RangeSelectionLexicalNodeFormatMatch {
  EQUALS,
  CONTAINS,
  NOT_MATCHED,
}

export default function TypingAffinityPlugin() {
  const [editor] = useLexicalComposerContext();
  const [caretType, setCaretType] = useState(CaretType.MIDDLE);
  const [selectionChangeFlag, setSelectionChangeFlag] = useState(false);

  const updatedByFormatTextRef = useRef(false);
  const footArrowRef = useRef<HTMLDivElement>(null);

  const $isCollapsedSelection = useCallback(
    (
      selection: RangeSelection | NodeSelection | GridSelection | null
    ): selection is RangeSelection => {
      return $isRangeSelection(selection) && selection.isCollapsed();
    },
    []
  );

  const $getCollapsedSelectionPosition = useCallback(
    (selection: RangeSelection): CollapsedSelectionPosition => {
      const nodes = selection.getNodes();
      if (nodes.length === 0) {
        return {
          node: null,
          position: CaretPosition.NODE_NOT_FOUND,
        };
      } else if ($isAtNodeEnd(selection.anchor)) {
        return {
          node: nodes[0],
          position: CaretPosition.NODE_END,
        };
      } else if (selection.getCharacterOffsets()[0] === 0) {
        return {
          node: nodes[0],
          position: CaretPosition.NODE_START,
        };
      } else {
        return {
          node: nodes[0],
          position: CaretPosition.NODE_NOT_FOUND,
        };
      }
    },
    []
  );

  const $getRangeSelectionAffinityToNode = useCallback(
    (node: LexicalNode, selection: RangeSelection) => {
      let selectionAffinityTypeToNode =
        RangeSelectionLexicalNodeFormatMatch.NOT_MATCHED;
      let level = 0;

      if ($isTextNode(node)) {
        const nodeStyle = node.getStyle();
        const nodeFormat = node.getFormat();

        if (nodeFormat === selection.format && nodeStyle === selection.style) {
          selectionAffinityTypeToNode =
            RangeSelectionLexicalNodeFormatMatch.EQUALS;
          level = node.getFormat() + (nodeStyle ? 1 : 0);
        } else if (
          !TEXT_FORMATS.some(
            (format) => node.hasFormat(format) && !selection.hasFormat(format)
          ) &&
          nodeStyle === selection.style
        ) {
          selectionAffinityTypeToNode =
            RangeSelectionLexicalNodeFormatMatch.CONTAINS;
          level = node.getFormat();
        }
      }

      return {
        affinity: selectionAffinityTypeToNode,
        level,
      };
    },
    []
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => {
          if (caretType === CaretType.RIGHT) {
            const selection = $getSelection();
            if (!$isCollapsedSelection(selection)) {
              return false;
            }

            event.preventDefault();

            const { position, node } =
              $getCollapsedSelectionPosition(selection);
            const preSibling =
              position === CaretPosition.NODE_START
                ? node.getPreviousSibling()
                : node;

            if (preSibling) {
              if ($isTextNode(preSibling)) {
                TEXT_FORMATS.forEach((format) => {
                  if (
                    (preSibling.hasFormat(format) &&
                      !selection.hasFormat(format)) ||
                    (!preSibling.hasFormat(format) &&
                      selection.hasFormat(format))
                  ) {
                    selection.toggleFormat(format);
                  }
                });
                selection.setStyle(preSibling.getStyle());
              }
            } else {
              TEXT_FORMATS.forEach((format) => {
                if (selection.hasFormat(format)) {
                  selection.toggleFormat(format);
                }
              });
              selection.setStyle("");
            }

            setCaretType(CaretType.LEFT);
          }
          return false;
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => {
          if (caretType === CaretType.LEFT) {
            const selection = $getSelection();
            if (!$isCollapsedSelection(selection)) {
              return false;
            }

            event.preventDefault();

            const { position, node } =
              $getCollapsedSelectionPosition(selection);
            const nextSibling =
              position === CaretPosition.NODE_START
                ? node
                : node?.getNextSibling();

            if (nextSibling) {
              if ($isTextNode(nextSibling)) {
                nextSibling.getKey();
                TEXT_FORMATS.forEach((format) => {
                  if (
                    (nextSibling.hasFormat(format) &&
                      !selection.hasFormat(format)) ||
                    (!nextSibling.hasFormat(format) &&
                      selection.hasFormat(format))
                  ) {
                    selection.toggleFormat(format);
                  }
                });
                selection.setStyle(nextSibling.getStyle());
              }
            } else {
              TEXT_FORMATS.forEach((format) => {
                if (selection.hasFormat(format)) {
                  selection.toggleFormat(format);
                }
              });
              selection.setStyle("");
            }

            setCaretType(CaretType.RIGHT);
          }
          return false;
        },
        COMMAND_PRIORITY_EDITOR
      )
    );
  }, [
    $getCollapsedSelectionPosition,
    $isCollapsedSelection,
    caretType,
    editor,
  ]);

  const $getNewCaretType = useCallback(
    (
      selection: RangeSelection | GridSelection | NodeSelection | null,
      fromSelectionChange = false
    ) => {
      if (!$isCollapsedSelection(selection)) {
        return CaretType.MIDDLE;
      }

      const { position, node } = $getCollapsedSelectionPosition(selection);

      if (position === CaretPosition.NODE_END && node.getNextSibling()) {
        // between two nodes
        const siblingNode = node.getNextSibling()!;
        const { affinity: affinityToNode, level: levelOfNode } =
          $getRangeSelectionAffinityToNode(node, selection);
        const { affinity: affinityToSibling, level: levelOfSibling } =
          $getRangeSelectionAffinityToNode(siblingNode, selection);

        if (
          affinityToNode === affinityToSibling &&
          levelOfNode === levelOfSibling
        ) {
          return CaretType.MIDDLE;
        } else if (
          affinityToNode === RangeSelectionLexicalNodeFormatMatch.EQUALS
        ) {
          return CaretType.LEFT;
        } else if (
          affinityToSibling === RangeSelectionLexicalNodeFormatMatch.EQUALS
        ) {
          return CaretType.RIGHT;
        } else if (fromSelectionChange) {
          // only for selection change
          const containsNode =
            affinityToNode === RangeSelectionLexicalNodeFormatMatch.CONTAINS;
          const containsSibling =
            affinityToNode === RangeSelectionLexicalNodeFormatMatch.CONTAINS;
          if (containsNode && containsSibling) {
            return levelOfNode >= levelOfSibling
              ? CaretType.LEFT
              : CaretType.RIGHT;
          } else if (!containsNode && !containsSibling) {
            return CaretType.LEFT;
          } else {
            return containsNode ? CaretType.LEFT : CaretType.RIGHT;
          }
        }
      } else if (position === CaretPosition.NODE_END) {
        // no next sibling
        const { affinity: affinityToNode, level } =
          $getRangeSelectionAffinityToNode(node, selection);
        if (affinityToNode === RangeSelectionLexicalNodeFormatMatch.EQUALS) {
          return level === 0 ? CaretType.MIDDLE : CaretType.LEFT;
        } else {
          return CaretType.RIGHT;
        }
      } else if (position === CaretPosition.NODE_START) {
        const { affinity: affinityToNode, level } =
          $getRangeSelectionAffinityToNode(node, selection);
        if (affinityToNode === RangeSelectionLexicalNodeFormatMatch.EQUALS) {
          return level === 0 ? CaretType.MIDDLE : CaretType.RIGHT;
        } else {
          return CaretType.LEFT;
        }
      } else if (position === CaretPosition.NODE_NOT_FOUND) {
        return CaretType.MIDDLE;
      }

      return null;
    },
    [
      $getCollapsedSelectionPosition,
      $getRangeSelectionAffinityToNode,
      $isCollapsedSelection,
    ]
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        () => {
          updatedByFormatTextRef.current = true;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const selection = $getSelection();

          const newCaretType = $getNewCaretType(selection, true);
          if (newCaretType) {
            setCaretType(newCaretType);
          }
          setSelectionChangeFlag((flag) => !flag);

          return false;
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerUpdateListener(({ editorState }) => {
        if (updatedByFormatTextRef.current) {
          editorState.read(() => {
            const selection = $getSelection();
            const newCaretType = $getNewCaretType(selection);
            if (newCaretType) {
              setCaretType(newCaretType);
            }
          });
          updatedByFormatTextRef.current = false;
        }
      })
    );
  }, [$getNewCaretType, editor]);

  const style = useMemo((): React.CSSProperties => {
    let stylesByCaretType = {};

    if (caretType === CaretType.MIDDLE) {
      stylesByCaretType = {
        display: "none",
      };
    } else {
      const nativeSelection = editor._window?.getSelection();
      if (nativeSelection && nativeSelection.rangeCount > 0) {
        const nativeRange = nativeSelection.getRangeAt(0);
        const rect = nativeRange.getBoundingClientRect();
        const parentRect =
          footArrowRef.current?.parentElement?.getBoundingClientRect();
        if (caretType === CaretType.LEFT) {
          stylesByCaretType = {
            left: rect.left - 6 - (parentRect?.left ?? 0),
            top: rect.bottom - 1 - (parentRect?.top ?? 0),
          };
        } else if (caretType === CaretType.RIGHT) {
          stylesByCaretType = {
            left: rect.left - (parentRect?.left ?? 0),
            top: rect.bottom - 1 - (parentRect?.top ?? 0),
          };
        }
      } else {
        stylesByCaretType = {
          display: "none",
        };
      }
    }

    return {
      ...stylesByCaretType,
      borderTop: "2px solid blue",
      height: "2px",
      position: "absolute",
      width: "6px",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caretType, editor, selectionChangeFlag]);

  return <div style={style} ref={footArrowRef} />;
}

export function Editor() {
  const initialConfig: InitialConfigType = {
    namespace: "MyEditor",
    theme,
    nodes: [LinkNode],
    onError: console.error,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="h-48 border px-2" />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <TypingAffinityPlugin />
      <HistoryPlugin />
      <LinkPlugin />
      <TreeViewPlugin />
    </LexicalComposer>
  );
}

export function TreeViewPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  return (
    <TreeView
      viewClassName="tree-view-output"
      treeTypeButtonClassName="debug-treetype-button"
      timeTravelPanelClassName="debug-timetravel-panel"
      timeTravelButtonClassName="debug-timetravel-button"
      timeTravelPanelSliderClassName="debug-timetravel-panel-slider"
      timeTravelPanelButtonClassName="debug-timetravel-panel-button"
      editor={editor}
    />
  );
}
