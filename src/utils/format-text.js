const LOCALE_VI = new Intl.Collator("vi").compare;

const VOS = {
  // Initial characters
  C: "[bdđhklmnrstvxBDĐHKLMNRSTVX]",

  // i/y non-standard words usually start with these ones
  Cc: "[hklmstvHKLMSTV]",

  // Inital full collection :p
  //    singles                            ch, nh, th..       gi       ng       ngh          tr
  Cf: "[bcdđghklmnpqrstvxBCDĐGHKLMNPQRSTVX]|[cgknptCGKNPT][hH]|[gG][iI]|[nN][gG]|[nN][gG][hH]|[tT][rR]",

  // Inital can be follow by schwa sounds (o, u)
  Cw: "[bcdđghlmnprstvxBCDĐGHLMNPRSTVX]|[cknptCKNPT][hH]|[gG][iI]|[nN][gG]|[tT][rR]",

  // yY in 6 tones
  Y: ["y", "ỳ", "ỷ", "ỹ", "ý", "ỵ", "Y", "Ỳ", "Ỷ", "Ỹ", "Ý", "Ỵ"],

  // yY with tone 1 ONLY
  Y1: ["y", "y", "y", "y", "y", "y", "Y", "Y", "Y", "Y", "Y", "Y"],

  // iI in 6 tones
  I: ["i", "ì", "ỉ", "ĩ", "í", "ị", "I", "Ì", "Ỉ", "Ĩ", "Í", "Ị"],

  // iI with tone marks ONLY (2-3-4-5-6)
  Ix: ["ì", "ì", "ỉ", "ĩ", "í", "ị", "I", "Ì", "Ỉ", "Ĩ", "Í", "Ị"],

  // iI in tone 1 only
  I1: ["i", "i", "i", "i", "i", "i", "I", "I", "I", "I", "I", "I"],

  // uU in 6 tones
  U: ["u", "ù", "ủ", "ũ", "ú", "ụ", "U", "Ù", "Ủ", "Ũ", "Ú", "Ụ"],

  // uU tone marks ONLY (2-3-4-5-6)
  Ux: ["ù", "ù", "ủ", "ũ", "ú", "ụ", "Ù", "Ù", "Ủ", "Ũ", "Ú", "Ụ"],

  // uU in tone 1 only
  U1: ["u", "u", "u", "u", "u", "u", "U", "U", "U", "U", "U", "U"],

  // oa, oe, uy with tone marks at wrong position

  Tw: [
    "òa",
    "ỏa",
    "õa",
    "óa",
    "ọa",
    "òe",
    "ỏe",
    "õe",
    "óe",
    "ọe",
    "ùy",
    "ủy",
    "ũy",
    "úy",
    "ụy",
    "ÒA",
    "ỎA",
    "ÕA",
    "ÓA",
    "ỌA",
    "ÒE",
    "ỎE",
    "ÕE",
    "ÓE",
    "ỌE",
    "ÙY",
    "ỦY",
    "ŨY",
    "ÚY",
    "ỤY",
    "Òa",
    "Ỏa",
    "Õa",
    "Óa",
    "Ọa",
    "Òe",
    "Ỏe",
    "Õe",
    "Óe",
    "Ọe",
    "Ùy",
    "Ủy",
    "Ũy",
    "Úy",
    "Ụy",
  ],

  // oa, oe, uy with tone marks at right position
  Tr: [
    "oà",
    "oả",
    "oã",
    "oá",
    "oạ",
    "oè",
    "oẻ",
    "oẽ",
    "oé",
    "oẹ",
    "uỳ",
    "uỷ",
    "uỹ",
    "uý",
    "uỵ",
    "OÀ",
    "OẢ",
    "OÃ",
    "OÁ",
    "OẠ",
    "OÈ",
    "OẺ",
    "OẼ",
    "OÉ",
    "OẸ",
    "UỲ",
    "UỶ",
    "UỸ",
    "UÝ",
    "UỴ",
    "Oà",
    "Oả",
    "Oã",
    "Oá",
    "Oạ",
    "Oè",
    "Oẻ",
    "Oẽ",
    "Oé",
    "Oẹ",
    "Uỳ",
    "Uỷ",
    "Uỹ",
    "Uý",
    "Uỵ",
  ],

  tone_sets: ["aăâeêioôơuưy", "àằầèềìòồờùừỳ", "ảẳẩẻểỉỏổởủửỷ", "ãẵẫẽễĩõỗỡũữỹ", "áắấéếíóốớúứý", "ạặậẹệịọộợụựỵ"],

  tone_pattern:
    "[aoôơuư][ìỉĩíị]|[ae][òỏõóọ]|[aâêiyươ][ùũủúụ]|[aâ][ỳỷỹýỵ]|[iu][àảãáạ]|[òỏõóọ][aăeo]|[ùũủúụ]yê|[ùũủúụ][âêyơô]|[ỳỷỹýỵìỉĩíị]ê|[ừửữứự]ơ|g[ìỉĩíị][aăeêoôơuư]|q[ùũủúụ][ai]",

  tone_pattern_regex:
    /[bcdđhklmnprstvx][aoôơuư][ìỉĩíị](?=\P{L}|$)|[u][ìỉĩíị](?=\P{L}|$)|[ae][òỏõóọ](?=\P{L}|$)|[bcdđhklmnprstvx][aâêiyươ][ùũủúụ](?=\P{L}|$)|(?=\P{L}|^)[aâêiyươ][ùũủúụ](?=\P{L}|$)|[aâ][ỳỷỹýỵ](?=\P{L}|$)|[bcdđhklmnprstvx][iu][àảãáạ](?=\P{L}|$)|[iu][àảãáạ](?=\P{L}|$)|[òỏõóọ][aăeo]|[ùũủúụ]yê|[ùũủúụ][âêyơô]|[ìỉĩíịỳỷỹýỵ]ê|[ừửữứự]ơ|g[ìỉĩíị][aăeêoôơuư]|q[ùũủúụ][ai]/giu,
};

function is_syllable(sample, rhyme_form = false) {
  sample = sample.trim();

  if (sample.length > 7) {
    return false;
  }
  const init = "(b|c|ch|d|đ|g|gh|gi|h|k|kh|l|m|n|ng|ngh|nh|p|q|ph|r|s|t|th|tr|v|x)";
  const init_no_q = "(b|c|ch|d|đ|g|gh|gi|h|k|kh|l|m|n|ng|ngh|nh|p|ph|q|r|s|t|th|tr|v|x)";
  const nuclear0 = "([aàảãáạăằẳẵắặâầẩẫấậeèẻẽéẹêềểễếệiìỉĩíịoòỏõóọôồổỗốộơờởỡớợuùủũúụưừửữứựyỳỷỹýỵ]|o[oòỏõóọ]|ô[ôồổỗốộ])";
  const nuclear2 = "([iìỉĩíịuùủũúụưừửữứự]a)";
  const nuclear3 = "([iy][êềểễếệ]|ư[ơờởỡớợ]|u[ôồổỗốộ])";
  let nuclear4 = "[aàảãăằẳẵâầẩẫeèẻẽêềểễiìỉĩoòỏõôồổỗơờởỡuùủũưừửữyỳỷỹ]";
  if (rhyme_form) {
    nuclear4 = "[àảãăằẳẵâầẩẫèẻẽêềểễìỉĩòỏõồổỗờởỡùủũừửữỳỷỹ]";
  }

  const e_ = "eèẻẽéẹ";
  const i_ = "iìỉĩíị";
  const o_ = "oòỏõóọ";
  const u_ = "uùủũúụ";

  const ending = "(c|ch|i|m|n|ng|nh|o|p|t|u|y)";
  const ending_no_y = "(c|ch|i|m|n|ng|nh|o|p|t|u)";

  const x110 = `(qu[aàảãáạ]|${init}?(o[aàảãáạeèẻẽéẹ]|u[eèẻẽéẹêềểễếệơờởỡớợyỳỷỹýỵ]|u[yỳỷỹýỵ]a))`;
  const x010 = `(${init_no_q}?(${nuclear0}|${nuclear2}))`;
  const x011 = `(${init}?(${nuclear0}|${nuclear3}|o[oòóỏõóọ])${ending}|[uùủũúụ]${ending_no_y})`;
  const x111 = `(${init}?((o[aàảãáạăằẳẵắặeèẻẽéẹ]|u[ăằẳẵắặâầẩẫấậeèẻẽéẹêềểễếệơờởỡớợyỳỷỹýỵ])|uy[aêềểễếệ]|qu[aàảãáạ])${ending})`;

  const not1 = "^((k|gh|ngh)[^heèẻẽéẹêềểễếệiìỉĩíị]|q[^u]).*$";
  const not2 = `(hh|${nuclear4}[ptc]|[${e_}](i|nh|u|y)|[^g][${i_}](i|o|y)|[${o_}](nh|u|y)|[${u_}](ch|nh|o|u))`;
  const not3 = "(c|ng)[eèẻẽéẹêềểễếệiìỉĩíị]|g[eèẻẽéẹêềểễếệ]|gi[iìỉĩíị]";

  const comp = `(${x110}|${x010}|${x011}|${x111})`;

  const re_comp = new RegExp(`^${comp}$`, "i");
  const re_not1 = new RegExp(not1, "i");
  const re_not2 = new RegExp(`(.*)?${not2}`, "i");
  const re_not3 = new RegExp(not3, "i");

  return re_comp.test(sample) && !re_not1.test(sample) && !re_not2.test(sample) && !re_not3.test(sample);
}

function remove_inline_tags(html) {
  return html.replace(/<\/?(a|i|b|span|strong|em|small|sub|sup|abbr|code|font)(\s[^>]+)?>/g, "");
}

function is_composite_unicode(string) {
  if (/[\u0300\u0309\u0303\u0301\u0323]/u.test(string)) {
    return true;
  }
  return false;
}

function get_plaintext(html) {
  // Normalize encoding
  if (is_composite_unicode(html)) {
    html = html.normalize("NFC");
  }
  return remove_inline_tags(html).replace(/<\/?[a-z0-9]+(\s[^>]+)?>/gi, "\n");
}

function thousand_separator(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function number_format_en(number) {
  if (number.match(/\d\.\d+,\d/)) {
    number = number.replace(/\./g, "_");
    number = number.replace(/\,/g, ".");
    number = number.replace(/_/g, ",");
  } else if (number.match(/^\-?\d+\,\d+$/)) {
    number = number.replace(/,/, ".");
  } else if (number.match(/^\-?(\d+)?(\.\d{3}){1,}$/)) {
    number = number.replace(/\./g, ",");
  }

  return number;
}

function number_format_vi(number) {
  if (number.match(/\d\,\d+\.\d/)) {
    number = number.replace(/\,/g, "_");
    number = number.replace(/\./g, ",");
    number = number.replace(/_/g, ".");
  } else if (number.match(/^\-?\d+\,\d+$/)) {
    number = number.replace(/\./, ",");
  } else if (number.match(/^\-?(\d+)?(\,\d{3}){1,}$/)) {
    number = number.replace(/\,/g, ".");
  }

  return number;
}

function encode_html_tags(thelist) {
  if (thelist !== undefined) {
    return thelist.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

function remove_tone_marks(string) {
  let chars = [
    "aàảãáạ",
    "ăằẳẵắặ",
    "âầẩẫấậ",
    "eèẻẽéẹ",
    "êềểễếệ",
    "iìỉĩíị",
    "oòỏõóọ",
    "ôồổỗốộ",
    "ơờởỡớợ",
    "uùủũúụ",
    "ưừửữứự",
    "yỳỷỹýỵ",
    "AÀẢÃÁẠ",
    "ĂẰẲẴẮẶ",
    "ÂẦẨẪẤẬ",
    "EÈẺẼÉẸ",
    "ÊỀỂỄẾỆ",
    "IÌỈĨÍỊ",
    "OÒỎÕÓỌ",
    "ÔỒỔỖỐỘ",
    "ƠỜỞỠỚỢ",
    "UÙỦŨÚỤ",
    "ƯỪỬỮỨỰ",
    "YỲỶỸÝỴ",
  ];

  for (let i = 0; i < chars.length; i++) {
    let regex = new RegExp("[" + chars[i] + "]", "g");
    string = string.replace(regex, chars[i][0]);
  }

  return string;
}

// Sort the list with multiple words in each row
function mwsort(lines, by_last_word = false, level = 0) {
  let maxlevel = 10,
    map = new Map(),
    groups = new Array(),
    by_number_value = false,
    count = lines.length;

  level = level + 1;

  // Skip single line or empty list
  if (count < 2) {
    return lines;
  }

  // Detect if line values are number or not
  if (level == 1 && lines[1].trim().match(/^\-?[0-9.,]+$/) && lines[count - 1].trim().match(/^\-?[0-9.,]+$/)) {
    by_number_value = true;
  }

  lines.forEach(function (line_, i) {
    let key, val;

    if (level == 1) {
      // Separate hyphens
      //line_ = line_.replace(/(.)\s?-\s?(.)/g, "$1 - $2");
      line_ = line_.replace(/(.)\s+-/g, "$1__#__-");
      line_ = line_.replace(/\s+/g, " ");
      line_ = line_.trim();
    }

    let line = line_.split(" ");
    if (by_last_word == true) {
      key = line[line.length - 1];
    } else {
      key = line[0];
    }

    if (line.length > 1) {
      if (by_last_word == true) {
        line.pop();
      } else {
        line.shift();
      }
      val = line.join(" ");
    } else {
      val = "";
    }

    if (map.has(key) === false) {
      map.set(key, i);
      groups[i] = new Array();
    }

    let id = map.get(key);
    groups[id].push(val);
  });

  groups.forEach(function (gitems, gid) {
    if (level < maxlevel && /\s/.test(gitems.join("")) === true) {
      groups[gid] = mwsort(gitems, by_last_word, level);
    } else {
      groups[gid] = gitems.sort(LOCALE_VI);
    }
  });

  let mindex = Array.from(map.keys());

  // Compare by number value if it looks like a list of numbers
  if (by_number_value) {
    let mindex_ = new Array();
    mindex.forEach(function (n) {
      // Convert to English locale
      let en = number_format_en(n);
      let pair = { number: n, value: en };
      mindex_.push(pair);
      // and sort by value
      mindex_.sort((a, b) => a.value - b.value);
    });

    mindex = new Array();
    // then return the sorted list
    mindex_.forEach(function (k) {
      mindex.push(k.number);
    });
  } else {
    mindex = mindex.sort(LOCALE_VI);
  }

  let sorted_lines = new Array();
  mindex.forEach(function (mkey, midx) {
    let id = map.get(mkey);
    groups[id].forEach(function (itm, gidx) {
      let line;
      if (by_last_word == true) {
        line = itm + " " + mkey;
      } else {
        line = mkey + " " + itm;
      }
      //line = line.replace(/ - /g, '-').trim();
      line = line.replace(/__#__-/g, " -").trim();
      sorted_lines.push(line);
    });
  });
  return sorted_lines;
}

// Sort the list by one of its columns
function mcsort(table, col = 0, by_last_word = false) {
  let map = new Map(),
    groups = new Array();
  let total = table.length - 1;

  table.forEach(function (row, i) {
    let key = row[col].trim();

    // Separate hyphens
    key = key.replace(/\s+/g, " ");
    key = key.replace(/\s?-\s?/g, "-"); // Very important!

    if (map.has(key) === false) {
      map.set(key, i);
      groups[i] = new Array();
    }
    let id = map.get(key);
    groups[id].push(row);
  });

  let mindex = Array.from(map.keys());
  mindex = mwsort(mindex, by_last_word);

  let sorted_table = new Array();
  mindex.forEach(function (mkey, midx) {
    let id = map.get(mkey);
    if (groups[id] !== undefined) {
      groups[id].forEach(function (itm, gidx) {
        sorted_table.push(itm);
      });
    } else {
      $("thelist-error").append("[Lỗi mcsort] Không thể tạo lại được dòng số " + id + "<br />");
    }
  });
  return sorted_table;
}

function corpus_link_anchor(keyword, class_ = "") {
  let extra = "";

  if (class_ != "") {
    class_ = ` class="${class_}"`;
  }
  if (/#$/u.test(keyword)) {
    keyword = keyword.replace("#", "");

    extra =
      ' <a class="link-to-photos" href="https://www.documentary.vn/keyword/' +
      encodeURIComponent(keyword) +
      '" target="_blank"><i class="bi bi-images"></i></a>';
  }
  return `<a ${class_} href="/corpus/?s=${keyword}&order=random" target="_blank">${keyword}</a>${extra}`;
}

function vos_y2i(sample) {
  let Cc = VOS["Cf"],
    Y = VOS["Y"].join(""),
    I = VOS["I"].join(""),
    Ux = VOS["Ux"].join(""),
    U1 = VOS["U1"].join("");

  for (let y = 0; y < Y.length; y++) {
    // quí- > quý-
    let regex = new RegExp(`(\\P{L}|^)([Qq])([Uu])${I[y]}([ptuPTU]|nh|NH|ch|CH)?(?=^|$|\\P{L})`, "gui");
    sample = sample.replace(regex, `$1$2$3${Y[y]}$4`);

    // qụi- > quỵ-
    regex = new RegExp(`(\\P{L}|^)([Qq])${Ux[y]}i([ptuPTU]|nh|NH|ch|CH)?(?=^|$|\\P{L})`, "gui");
    sample = sample.replace(regex, `$1$2${U1[y]}${Y[y]}$3`);

    // hy, kỳ, lý > hi, kì, lí
    regex = new RegExp(`(\\P{L}|^)(${Cc})${Y[y]}(?=^|$|\\P{L})`, "gui");
    sample = sample.replace(regex, `$1$2${I[y]}`);
  }

  return sample;
}

function vos_oaoeuy(sample) {
  let Cf = VOS["Cf"],
    // OA, OE, UY: incorrect tone marks position
    wrong = VOS["Tw"],
    // OA, OE, UY: corrected tone marks position
    right = VOS["Tr"];

  for (let i = 0; i < wrong.length; i++) {
    // Replace wrong
    let regex = new RegExp(`(\\P{L}|^)(${Cf})\?${wrong[i]}`, "gu");
    sample = sample.replace(regex, `$1$2${right[i]}`);
  }
  return sample;
}

function vos_fix_tonemark_position(sample) {
  // Find all incorrect tone placements

  let found = [...sample.matchAll(VOS["tone_pattern_regex"])].map((match) => match[0]);

  //console.log('Found', found);

  let replacing = {};

  // Process incorrect tone placements
  for (let combination of found) {
    let toned_char = "",
      toned_char_index = 0,
      tone = 0,
      consonant = "";

    if (/^[bcdđghklmnpqrstvx]/i.test(combination)) {
      consonant = combination[0].toLowerCase();
    }

    // Identify the misplaced tone mark
    for (let i = 1; i <= 5; i++) {
      let match = combination.match(new RegExp(`[${VOS["tone_sets"][i]}]`, "ui"));
      if (match) {
        toned_char = match[0];
        toned_char_index = VOS["tone_sets"][i].indexOf(toned_char.toLowerCase());
        tone = i;
        break;
      }
    }

    let position = combination.split("").reverse().join("").indexOf(toned_char);

    if (consonant.length > 0) {
      position += 1;
    }

    let nuclear = combination.charAt(position);

    // Correct the tone mark
    let nuclear_index = VOS["tone_sets"][0].indexOf(nuclear.toLowerCase());
    let new_combination = VOS["tone_sets"][0][toned_char_index] + VOS["tone_sets"][tone][nuclear_index];

    if (combination.length == 3 && consonant.length == 0) {
      new_combination = VOS["tone_sets"][0][toned_char_index] + combination[1] + VOS["tone_sets"][tone][nuclear_index];
    }

    if (position === 0 || (position === 1 && consonant != "")) {
      new_combination = new_combination.split("").reverse().join("");
    }

    new_combination = consonant + new_combination;

    // Maintain original capitalization
    if (combination === combination.toUpperCase()) {
      new_combination = new_combination.toUpperCase();
    } else if (combination[0] === combination[0].toUpperCase()) {
      new_combination = new_combination[0].toUpperCase() + new_combination.substring(1);
    }

    replacing[combination] = new_combination;
  }

  // Apply corrections
  for (const [wrong, correct] of Object.entries(replacing)) {
    if (/^([iu][àảãáạ]|u[ìỉĩíị])$/iu.test(wrong) == false) {
      sample = sample.replace(new RegExp(`(\\p\{L\}*)${wrong}(\\w*|\\P\{L\})`, "gu"), `\$1${correct}\$2`);
    } else {
      sample = sample.replace(new RegExp(`(\\P\{L\})${wrong}`, "gu"), `\$1${correct}`);
    }
  }

  sample = vos_y2i(sample);

  return sample;
}

function removeVietnameseTones(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function capitalizeWords(str) {
  const segmenter = new Intl.Segmenter("vi", { granularity: "word" });
  return [...segmenter.segment(str)]
    .map(({ segment, isWordLike }) => {
      if (!isWordLike) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join("");
}

export {
  LOCALE_VI,
  VOS,
  is_syllable,
  remove_inline_tags,
  is_composite_unicode,
  get_plaintext,
  thousand_separator,
  number_format_en,
  number_format_vi,
  encode_html_tags,
  remove_tone_marks,
  mwsort,
  mcsort,
  corpus_link_anchor,
  vos_y2i,
  vos_oaoeuy,
  vos_fix_tonemark_position,
  removeVietnameseTones,
  capitalizeWords
};
