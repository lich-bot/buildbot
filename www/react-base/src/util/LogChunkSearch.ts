/*
  This file is part of Buildbot.  Buildbot is free software: you can
  redistribute it and/or modify it under the terms of the GNU General Public
  License as published by the Free Software Foundation, version 2.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
  details.

  You should have received a copy of the GNU General Public License along with
  this program; if not, write to the Free Software Foundation, Inc., 51
  Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

  Copyright Buildbot Team Members
*/

import {stripLineEscapeCodes} from "./AnsiEscapeCodes";
import {binarySearchGreater} from "./BinarySearch";
import {ParsedLogChunk} from "./LogChunkParsing";

export type ChunkSearchResult = {
  // Global line index
  lineIndex: number;
  // The location of the found search string occurrence
  lineStart: number;
};

export type ChunkSearchResults = {
  results: ChunkSearchResult[];
  lineIndexToFirstChunkIndex: Map<number, number>;
};

export function resultsListToLineIndexMap(results: ChunkSearchResult[]) : Map<number, number> {
  const indexMap = new Map<number, number>();
  if (results.length === 0) {
    return indexMap;
  }
  indexMap.set(results[0].lineIndex, 0);
  let prevLineIndex = results[0].lineIndex;
  for (let i = 1; i < results.length; ++i) {
    const lineIndex = results[i].lineIndex;
    if (lineIndex !== prevLineIndex) {
      indexMap.set(lineIndex, i);
      prevLineIndex = lineIndex;
    }
  }
  return indexMap;
}

function maybeAdvanceLineIndexToBound(lineIndex: number, pos: number, lineBounds: number[]) {
  if (pos < lineBounds[lineIndex + 1]) {
    return lineIndex;
  }
  lineIndex++;
  // Don't do binary search right away, the wanted index may be several lines away
  for (let i = 0; i < 3; ++i) {
    if (pos < lineBounds[lineIndex + 1]) {
      return lineIndex;
    }
    lineIndex++;
  }

  return binarySearchGreater(lineBounds, pos, undefined, lineIndex) - 1;
}

function findTextInLine(results: ChunkSearchResult[], text: string, lineIndex: number,
                        searchString: string) {
  let pos = text.indexOf(searchString, 0);
  while (pos >= 0) {
    results.push({
      lineIndex: lineIndex,
      lineStart: pos,
    });
    pos = text.indexOf(searchString, pos + searchString.length);
  }
}

export function findTextInChunkRaw(chunk: ParsedLogChunk,
                                   searchString: string): ChunkSearchResult[] {
  const searchNoPerLineEscapes =
    chunk.linesWithEscapes === null || chunk.linesWithEscapes.length === 0;

  if (searchNoPerLineEscapes) {
    const text = chunk.textNoEscapes !== null ? chunk.textNoEscapes : chunk.text;
    const lineBounds = chunk.textNoEscapesLineBounds !== null
      ? chunk.textNoEscapesLineBounds : chunk.textLineBounds;

    const results: ChunkSearchResult[] = [];
    let pos = text.indexOf(searchString, 0);
    let lineIndex = 0;
    while (pos >= 0) {
      lineIndex = maybeAdvanceLineIndexToBound(lineIndex, pos, lineBounds);
      results.push({
        lineIndex: lineIndex + chunk.firstLine,
        lineStart: pos - lineBounds[lineIndex]
      });
      pos = text.indexOf(searchString, pos + searchString.length);
    }
    return results;
  }

  // Hybrid search by searching text without escape sequences and handling lines with escape
  // sequences as a special case.

  const text = chunk.text;
  const lineBounds = chunk.textLineBounds;
  const linesWithEscapes = chunk.linesWithEscapes!;

  const results: ChunkSearchResult[] = [];
  let pos = text.indexOf(searchString, 0);
  let lineIndex = 0;
  let linesWithEscapesIndex = 0;

  while (pos >= 0) {
    lineIndex = maybeAdvanceLineIndexToBound(lineIndex, pos, lineBounds);

    if (linesWithEscapesIndex < linesWithEscapes.length) {
      if (lineIndex === linesWithEscapes[linesWithEscapesIndex]) {
        // Skip results from escaped line
        pos = text.indexOf(searchString, pos + searchString.length);
        continue;
      }
      if (lineIndex > linesWithEscapes[linesWithEscapesIndex]) {
        // Add results from any skipped escaped lines.
        while (linesWithEscapesIndex < linesWithEscapes.length &&
            lineIndex > linesWithEscapes[linesWithEscapesIndex]) {
          const escapedLineIndex = linesWithEscapes[linesWithEscapesIndex];
          const line = text.slice(lineBounds[escapedLineIndex], lineBounds[escapedLineIndex + 1]);
          findTextInLine(results, stripLineEscapeCodes(line), chunk.firstLine + escapedLineIndex,
            searchString);
          linesWithEscapesIndex++;
        }

        // linesWithEscapeIndex got updated, check if the current result from `text` is in an
        // escaped line.
        if (linesWithEscapesIndex < linesWithEscapes.length &&
          lineIndex === linesWithEscapes[linesWithEscapesIndex]) {
          // Skip results from escaped line
          pos = text.indexOf(searchString, pos + searchString.length);
          continue;
        }
      }
    }

    results.push({
      lineIndex: lineIndex + chunk.firstLine,
      lineStart: pos - lineBounds[lineIndex]
    });
    pos = text.indexOf(searchString, pos + searchString.length);
  }

  while (linesWithEscapesIndex < linesWithEscapes.length) {
    const escapedLineIndex = linesWithEscapes[linesWithEscapesIndex];
    const line = text.slice(lineBounds[escapedLineIndex], lineBounds[escapedLineIndex + 1]);
    findTextInLine(results, stripLineEscapeCodes(line), chunk.firstLine + escapedLineIndex,
      searchString);
    linesWithEscapesIndex++;
  }

  return results;
}

export function findTextInChunk(chunk: ParsedLogChunk,
                                searchString: string): ChunkSearchResults {
  const results = findTextInChunkRaw(chunk, searchString);
  return {results, lineIndexToFirstChunkIndex: resultsListToLineIndexMap(results)};
}
