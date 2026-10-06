export { fRank };

// Fuzzy Rank
function fRank(searchRaw: string, targetRaw: string): number {
  if (searchRaw === targetRaw) {
    return 0;
  }
  if (!searchRaw || !targetRaw) {
    return -Infinity;
  }

  const searchLow = searchRaw.toLowerCase();
  const targetLow = targetRaw.toLowerCase();
  const searchLen = searchLow.length;
  const targetLen = targetLow.length;
  const matchesSimple: number[] = [];
  let matchI = -1;
  let firstMatchI = -1;
  let isTypoSimple = false;
  let typoI = 0;

  // First fuzzy match, fast filtering non matching targets
  // If search chars not completely present in target - exit
  firstMatchI = targetLow.indexOf(searchLow[0]);
  if (firstMatchI === -1) {
    return -Infinity;
  } else {
    matchesSimple.push(firstMatchI);
  }
  // Typo in first char is not allowed => we don't replace first char
  // Searching for consecutive matches
  for (let i = 1; i < searchLen; i++) {
    matchI = targetLow.indexOf(searchLow[i], matchesSimple[i - 1] + 1);
    if (matchI === -1) {
      // Matches are not consecutive => suppose it is typo
      isTypoSimple = true;
      typoI = i;
      break;
    } else {
      matchesSimple.push(matchI);
    }
  }

  if (isTypoSimple) {
    // Check if it is typo or exit
    // Searching for any matches, that is different from the previous
    for (let i = typoI; i < searchLen; i++) {
      let lastMatchI = firstMatchI + 1;
      let is_found = false;
      for (; !is_found;) {
        matchI = targetLow.indexOf(searchLow[i], lastMatchI);
        if (matchI === -1) {
          return -Infinity;
        }
        const char_repeat_i = matchesSimple.indexOf(matchI);
        if (char_repeat_i === -1) {
          matchesSimple.push(matchI);
          is_found = true;
        } else {
          lastMatchI = matchI + 1;
        }
      }
    }
  }
  matchesSimple.sort((a, b) => a - b);

  // Need to improve matchSimple with strict consecutive match 
  // with RANDOM (?) subsequence of search + begin indexes
  // let successStrict = false;
  // const beginningIndexes = prepareBeginningIndexes(target);
  // // First char to strict compare
  // let beginI = beginningIndexes.findIndex((item, ind) => item === matchesSimple[0]);
  // if (beginI !== -1) {
  // // endsWith
  // // startsWith
  // // includes
  // // indexOf
  // // lastIndexOf

  const matchesStrict: number[] = [];
  let searchI = 0;
  let targetI = 0;
  let typoStrictI = 0;
  let successStrict = false;
  let matchesStrictLen = 0;

  const nextBegIndexes = _prepareNextBeginningIndexes(targetRaw);
  const firstPossibleI = matchesSimple[0] === 0 ?
    0 : nextBegIndexes[matchesSimple[0] - 1];
    targetI = firstPossibleI;

  // All chars in search is present in target
  // Try to improve the rank with consecutive or a beginning character matches!
  if (targetI !== targetLen) {
    for (; ;) {
      if (targetI >= targetLen) {
        // Failed to find a good spot for this search char, go back to the previous 
        // search char and force it forward
        if (searchI <= 0) {
          // Failed to find chars forward for a better match
          // transpose, starting from the beginning. Work for neighbor chars
          ++typoStrictI;
          if (typoStrictI > searchLen - 2) {
            // Too many typo
            break;
          }
          if (searchLow[typoStrictI] === searchLow[typoStrictI + 1]) {
            continue;
          } // don't need to transpose a repeat neighbor char
          targetI = firstPossibleI;
          continue;
        }
        // Go left for previous search char, to start compare with next begin char
        --searchI;
        const last_match = matchesStrict[--matchesStrictLen];
        targetI = nextBegIndexes[last_match];
      } else {
        // Neighbor transpose logic 
        let newSearchI = 0;
        if (typoStrictI === 0) {
          newSearchI = searchI;
        } else if (typoStrictI === searchI) {
          newSearchI = searchI + 1;
        } else if (typoStrictI === searchI - 1) {
          newSearchI = searchI - 1;
        } else {
          newSearchI = searchI;
        }
        const is_match = searchLow[newSearchI] === targetLow[targetI];
        if (is_match) {
          matchesStrict[matchesStrictLen++] = targetI;
          ++searchI;
          if (searchI === searchLen) {
            successStrict = true;
            break;
          }
          ++targetI;
        } else {
          targetI = nextBegIndexes[targetI];
        }
      }
    }
  }

  //  Calculating result 
  let matchesBest;
  if (successStrict) {
    matchesBest = matchesStrict;
  } else {
    matchesBest = matchesSimple;
  }
  return _getRank(matchesBest, searchLen, targetLen,
    successStrict, isTypoSimple, typoStrictI !== 0);



  function _prepareBeginningIndexes(target: string): number[] {
    // Indexes of first char, first Capital or divider (/,_, " ", etc.)
    const alphaNumTempl = /\w/;
    const targetLen = target.length;
    const begIndexes: number[] = [];
    let wasUpper = false;
    let wasAlphanum = false;
    for (let i = 0; i < targetLen; ++i) {
      const targetChar = target[i];
      const isUpper = targetChar === targetChar.toUpperCase();
      const isAlphanum = alphaNumTempl.test(targetChar);
      const isBeginning = isUpper && !wasUpper || !wasAlphanum || !isAlphanum;
      wasUpper = isUpper;
      wasAlphanum = isAlphanum;
      if (isBeginning) {
        begIndexes.push(i);
      }
    }
    return begIndexes;
  }

  function _prepareNextBeginningIndexes(target: string): number[] {
    // next_beg_indexes[i] - Index of next begining char in target after "i"
    const targetLen = target.length;
    const begIndexes = _prepareBeginningIndexes(target);
    const nextBegIndexes: number[] = [];
    let nextBegI = begIndexes[0];
    let last_beginning_i = 0;
    for (let i = 0; i < targetLen; ++i) {
      if (nextBegI > i) {
        nextBegIndexes[i] = nextBegI;
      } else {
        nextBegI = begIndexes[++last_beginning_i];
        nextBegIndexes[i] = nextBegI === undefined ? targetLen : nextBegI;
      }
    }
    return nextBegIndexes;
  }

  function _getRank(matches: number[], searchLen: number, targetLen: number,
    isStrict: boolean, isTypoSimple: boolean, isTypoStrict: boolean): number {
    let rank = 0;
    let lastTargetI = -1;
    for (let i = 0; i < searchLen; ++i) {
      const targetI = matches[i];
      // Rank decreases if matches not consecutive
      // Depends on indexes. The best match - at the Start of Short string.
      if (lastTargetI !== targetI - 1) {
        rank -= targetI;
      }
      lastTargetI = targetI;
    }
    // Rank for strict subsequence, I think, will be from 0 to ~200
    // With a margin for target length I limit it with 1000, to make 
    // Depends on test could be 100
    // a difference between strict and no strict
    // Penalty with a margin for target WORD length limit in 20
    // Rank for folder path - Match in the begin is prefered than match in the end.
    // => "folder/name"  revert -> "name/folder"
    if (!isStrict) {
      rank *= 1000; // Penalty for non strict
      if (isTypoSimple) {
        rank -= 20; // Penalty for typo simple
      }
    } else {
      if (isTypoStrict) {
        rank -= 20; // Penalty for typo strict
      }
    }
    // Rank decreases for long string
    rank -= targetLen - searchLen;
    return rank;
  }
}