const ENTRY = document.getElementById('entry');
const CONTENT = document.getElementById('detailContent');
const LISTING = document.getElementById('listing');
const URL_REGEX = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/;

const DOC_VARS = [];

let noteslocal = [];
let noteIndex = 0;
let selectedNoteIndex;

const scrollToBottom = () => {
  document.querySelector('.detail').scrollTop += 15000;
};

const escapeRegExp = (str) =>
  str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");

const replaceAll = (str, find, replace) =>
  str.replace(new RegExp(escapeRegExp(find), 'g'), replace);

const randomString = (length) =>
  Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);

const getThumbnail = (site, callback) => {
  const API = `https://api.letsvalidate.com/v1/thumbs/?url=${site}&output=json`;
  const APItech = `https://api.letsvalidate.com/v1/technologies/?url=${site}&output=json`;
  let url;
  fetch(APItech).then(function(response) {
    return response.json();
  }).then(function(respa) {
    url = respa.urls[0];
    fetch(API).then(function(response) {
      return response.json();
    }).then(function(resp) {
      return callback(resp.base64, url);
    }).catch(error => {
      callback(false);
    });
  }).catch(error => {
    callback(false);
  });
};

const createElement = (markup) =>
  document.createRange().createContextualFragment(markup);

const types = {
  list: {
    match: (content) =>
      content.substr(0, 2) === '* ',
    format: (content) =>
      content.replace('* ', '')
  },
  quote: {
    match: (content) =>
      content.substr(0, 2) === '> ',
    format: (content) =>
      content.substr(1)
  },
  header: {
    match: (content) =>
      content.includes('# '),
    format: (content) => {
      let count = 1;
      let tag;
      while(count < 5) {
        if(content[count] === '#') {
          count++;
        }
        else {
          tag = `h${count}`;
          content = content.substr(count);
          count = 5;
        }
      }
      return `<${tag}>${content}</${tag}>`;
    }
  },
  variable: {
    match: (content) =>
      content.charAt(0) === '$' && content.slice(-1) === ';',
    format: (content) => {
      content = content.split(':');
      const val = content.pop().slice(0, -1).trim();
      DOC_VARS.push({
        name: content[0],
        val: val
      });
      return `<pre class="variable code"><span class="var-name">${content[0]}</span>:<span class="var-val">${val}</span></pre>`;
    }
  },
  math: {
    match: (content) =>
      /^[^a-z]*$/i.test(content),
    format: (content) => {
      return `<pre class='code'>${content} => ${eval(content)}</pre>`;
    }
  },
  code: {
    match: (content) =>
      content.substr(0, 3) === '```' && content.substr(-3) === '```',
    format: (content) => {
      content = content.slice(3, -3);
      const lang = detectLang(content);
      const id = randomString(12);
      Rainbow.color(content, lang, function(highlightedCode) {
        const el = document.querySelector(`[data-async-id="${id}"]`);
        el.setAttribute('data-language', lang);
        el.innerHTML = highlightedCode;
      });
      return `<pre data-async-id="${id}">${content}</pre>`;
    }
  },
  url: {
    match: (content) =>
      content.match(URL_REGEX) && content.charAt(0) === '[' && content.slice(-1) === ']',
    format: (content) => {
      const id = randomString(12);
      content = content.slice(1, -1);
      getThumbnail(content, (src, url) => {
        let result;
        const message = document.querySelector(`[data-async-id="${id}"]`);
        if(url) {
          if(url) {
            message.querySelector('img').setAttribute('src', `data:image/jpeg;base64,${src}`);
          }
          else {
            message.querySelector('img').style.display = 'none';
          }
          message.querySelector('a').setAttribute('href', url);
          message.querySelector('p').innerText = url;
        }
        else {
          const fillin = () => {
            content = content.includes('http') ? content : `http://${content}`;
            message.querySelector('img').style.display = 'none';
            message.querySelector('a').setAttribute('href', content);
            message.querySelector('p').innerText = content;
          };
          fillin();
        }
        message.classList.remove('dummy-link-loader');
      });
      return `
        <div data-async-id=${id} class="message url dummy-link-loader">
          <div class="m-c">
            <a target="_blank">
              <img>
              <p>${content}</p>
            </a>
          </div>
          <div class="edit-message">Edit</div>
        </div>`;
    }
  }
};

const inlineStyles = {
  api: {
    input: ['@', '@'],
    output: ['', ''],
    process: (api, callback) => {
      fetch(`${api}`).then(function(response) {
        return response.json();
      }).then(function(resp) {
        return callback(resp);
      }).catch(error => {
        callback(false);
      });
    }
  },
  bold: {
    input: ['*', '*'],
    output: ['<b>', '</b>']
  },
  italic: {
    input: ['_', '_'],
    output: ['<i>', '</i>']
  },
  code: {
    input: ['`', '`'],
    output: ['<pre class="inline-code">', '</pre>']
  }
};

const getInlineStyle = (content, expression) => {
  const inputOpen = expression.input[0];
  const inputClose = expression.input[1];
  const outputOpen = expression.output[0];
  const outputClose = expression.output[1];
  const openPos = content.indexOf(inputOpen);
  let closePos = content.indexOf(inputClose);
  if(openPos === closePos) {
    let trimmed = content.substring(openPos + 1);
    closePos = trimmed.indexOf(inputClose) + openPos;
    if(openPos === closePos) {
      return false;
    }
  }
  if(openPos > -1 && closePos > -1 && openPos < closePos) {
    return {
      open: openPos,
      close: closePos,
      inputOpen: inputOpen,
      inputClose: inputOpen,
      outputOpen: outputOpen,
      outputClose: outputClose,
      process: expression.process || false
    };
  }
  else {
    return false;
  }
};

const wrap = (content, params) => {
  let result = content.slice(params.open + 1, params.close + 1);
  if(params.process) {
    let resP = new Promise(resolve => {
      params.process(result, (res) => {
        const path = content.substr(params.close + 3).split("/")[0];
        let find = `${params.inputOpen}${result}${params.inputClose}`;
        if(path !== '') {
          const pathNav = path.split(".");
          pathNav.map(p => {
            res = res[p];
            return res;
          });
          content = content.replace(`.${path}/`, '');
        }
        const replace = `${params.outputOpen}${res}${params.outputClose}`;
        content = content.replace(find, replace);
        resolve(content);
      });
    });
    return resP;
  }
  else {
    content = content.replace(`${params.inputOpen}${result}${params.inputClose}`, `${params.outputOpen}${result}${params.outputClose}`);
    return content;
  }
  return false;
};

const getType = (content) => {
  for(let type in types) {
    if(types[type].match(content)) {
      return type;
    }
  }
  return false;
};

const fillInVars = (content) => {
  DOC_VARS.forEach(vbl => {
    content = content.replace(vbl.name, vbl.val);
  });
  return content;
};

/* jshint ignore:start */
const message = async (content) => {
  let failsafe = 0;
  const isVar = types.variable.match(content);
  content = DOC_VARS.length > 0 && !isVar ? fillInVars(content) : content;
  let type = getType(content);
  if(type !== 'math') {
    for(let style in inlineStyles) {
      let inlineStyle = getInlineStyle(content, inlineStyles[style]);
      while(inlineStyle && failsafe < 100) {
        content = await wrap(content, inlineStyle);
        inlineStyle = getInlineStyle(content, inlineStyles[style]);
        failsafe++;
      }
    }
  }
  if(type) {
    const result = await types[type].format(content);
    return type === 'url' ? result : `<div class="message ${type}"><div class="m-c">${result}</div><div class="edit-message">Edit</div></div>`;
  }
  return `<div class="message text"><div class="m-c">${content}</div><div class="edit-message">Edit</div></div>`;
};

const enterMessage = async () => {
  const content = ENTRY.value;
  const style = getType(content) || 'none';
  const id = randomString(12);
  let result = await message(content);
  if(content.length > 0) {
    let element = createElement(result);
    if(selectedNoteIndex !== undefined) {
      const note = noteslocal[noteIndex].messages[selectedNoteIndex];
      let edited = CONTENT.querySelector(`.message:nth-child(${selectedNoteIndex + 1})`);
      note.content = content;
      note.type = style;
      renderMessages(noteIndex);
    }
    else {
      element.querySelector('.message').setAttribute('id', id);
      element.querySelector('.edit-message').onclick = (e) => {
        selectMessage(e);
      }
      CONTENT.appendChild(element);
      scrollToBottom();
    }
  }

  localforage.getItem('notes').then(function(notes) {
    if(!notes) {
      const note = {
        exerpt: CONTENT.querySelector('.message:first-child').innerText,
        messages: [{
          id: id,
          content: content,
          type: style
        }]
      };
      localforage.setItem('notes', [note]);
      noteslocal = [note];
      renderNotes([note]);
    }
    else {
      if(selectedNoteIndex === undefined) {
        noteslocal[noteIndex].messages.push({
          id: id,
          content: content,
          type: style
        });
      }
      selectedNoteIndex = undefined;
      save();
    }
  });
};
/* jshint ignore:end */

const save = () => {
  let note = {
    exerpt: CONTENT.querySelector('.message:first-child').innerText,
    messages: noteslocal[noteIndex].messages
  };
  noteslocal[noteIndex] = note;
  localforage.setItem('notes', noteslocal);
};

const newNote = () => {
  let note = {
    exerpt: 'New Note',
    messages: []
  };
  noteslocal.unshift(note);
  renderNotes(noteslocal);
  showNoteDetail(0);
};

const styleSelectedNote = (index) => {
  const notes = LISTING.querySelectorAll('li');
  notes.forEach(note => {
    note.classList.remove('selected');
  });
  notes[index].classList.add('selected');
};

const getMessageById = (id) => {
  let result;
  noteslocal[noteIndex].messages.forEach(note => {
    if(note.id === id) {
      result = note;
    }
  });
  return result;
};

const selectMessage = (e) => {
  let el = e.target;
  if(!el.classList.contains('message')){
    while ((el = el.parentElement) && !el.classList.contains('message'));
  }
  const id = el.getAttribute('id');
  const note = getMessageById(id);
  ENTRY.value = note.content;
  ENTRY.focus();
  const baseScrollHeight = 54;
  const scrollHeight = ENTRY.scrollHeight;
  const rows = ((ENTRY.scrollHeight - baseScrollHeight)/22) + 1;
  el.classList.add('message-selected');
  if(ENTRY.value.length > 1 && rows !== ENTRY.getAttribute('rows')) {
    ENTRY.setAttribute('rows', rows);
  }
  selectedNoteIndex = noteslocal[noteIndex].messages.indexOf(note);
};

/* jshint ignore:start */

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

const renderMessages = (index) => {
  const messages = noteslocal[index].messages;
  const results = document.createDocumentFragment();
  CONTENT.innerHTML = '';
  if(messages.length > 0) {
    asyncForEach(noteslocal[index].messages, async (note) => {
      let result = await message(note.content);
      let element = createElement(result);
      element.querySelector('.message').setAttribute('id', note.id);
      element.querySelector('.edit-message').onclick = (e) => {
        selectMessage(e);
      }
      CONTENT.appendChild(element);
    });
  }
}
/* jshint ignore:end */

const showNoteDetail = (index) => {
  noteIndex = index;
  DOC_VARS.length = 0;
  renderMessages(index);
  styleSelectedNote(index);
};

const deleteNote = (index) => {
  noteslocal.splice(index, 1);
  localforage.setItem('notes', noteslocal);
  renderNotes(noteslocal);
};

const renderNotes = (notes) => {
  LISTING.innerHTML = '';
  notes.forEach((note, index) => {
    const listing = `<li onclick="showNoteDetail(${index})"><span>${note.exerpt}</span><div class="delete" onclick="deleteNote(${index})">✕</div></li>`;
    LISTING.innerHTML += listing;
  });
  showNoteDetail(0);
};

const noNotesYet = () => {
  localforage.getItem('notes').then(notes => {
    if(notes) {
      return false;
    }
    else {
      return true;
    }
  });
};

const loadNotes = () => {
  localforage.getItem('notes').then(notes => {
    if(notes) {
      noteslocal = notes;
      renderNotes(noteslocal);
    }
    else {
      noteslocal.push(basics);
      newNote();
    }
  });
};

const deleteMessage = () => {
  console.log('this is happening');
  CONTENT.querySelector(`.message:nth-child(${selectedNoteIndex + 1})`).remove();
  noteslocal[noteIndex].messages.splice(selectedNoteIndex, 1);
  save();
};

ENTRY.onkeydown = (e) => {
  const hittingEnter = e.keyCode === 13;
  if(hittingEnter) {
    e.preventDefault();
    if(selectedNoteIndex && ENTRY.value.length < 1) {
      deleteMessage();
    }
  }
};

ENTRY.onkeyup = (e) => {
  const hittingEnter = e.keyCode === 13;
  const baseScrollHeight = 54;
  const scrollHeight = ENTRY.scrollHeight;
  const canSendMessage = ENTRY.value.length > 1;
  const rows = ((ENTRY.scrollHeight - baseScrollHeight)/22) + 1;
  if(ENTRY.value.length > 1 && rows !== ENTRY.getAttribute('rows')) {
    ENTRY.setAttribute('rows', rows);
  }
  if(hittingEnter && canSendMessage) {
    enterMessage();
    ENTRY.value = '';
    ENTRY.setAttribute('rows', 1);
  }
};

ENTRY.onblur = () => {
  if(selectedNoteIndex) {
    selectedNoteIndex = null;
    document.querySelector('.message-selected').classList.remove('message-selected');
    ENTRY.value = '';
  }
};

document.body.onkeyup = (e) => {
  if(e.key === 'Backspace') {
    let selected = document.querySelectorAll('.message--selected');
    selected.forEach(select => {
      select.remove();
    });
  }
};

loadNotes();
