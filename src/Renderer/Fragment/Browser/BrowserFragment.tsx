import fs from 'fs-extra';
import path from 'path';
import electron, {clipboard, shell} from 'electron';
import React from 'react';
import ReactDOM from 'react-dom';
import escapeHTML from 'escape-html';
import {IssueEvent} from '../../Event/IssueEvent';
import {IssueRepo} from '../../Repository/IssueRepo';
import {WebViewEvent} from '../../Event/WebViewEvent';
import {UserAgentUtil} from '../../Util/UserAgentUtil';
import {StreamEvent} from '../../Event/StreamEvent';
import {SystemStreamEvent} from '../../Event/SystemStreamEvent';
import {GARepo} from '../../Repository/GARepo';
import {GitHubClient} from '../../Infra/GitHubClient';
import {ConfigRepo} from '../../Repository/ConfigRepo';
import {BrowserViewIPC} from '../../../IPC/BrowserViewIPC';
import {AppIPC} from '../../../IPC/AppIPC';
import {IssueEntity} from '../../Type/IssueEntity';
const {Menu, MenuItem} = electron.remote;

const jsdiff = require('diff');
const remote = electron.remote;

// hack: support japanese tokenize
require('diff/lib/diff/word').wordDiff.tokenize = function(value){
  return value.split(/(\s+|\b|、|。|「|」)/u);
};

interface State {
  issue: any;
  readBody: any;
  currentUrl: string;
  classNameLoading: '' | 'loading';
  classNameBackButton: '' | 'deactive';
  classNameForwardButton: '' | 'deactive';
  classNameSearchBox: '' | 'hidden';
  searchInPageCount: string;
}

export class BrowserFragment extends React.Component<any, State> {
  state: State = {
    issue: null,
    readBody: null,
    currentUrl: null,
    classNameLoading: '',
    classNameBackButton: 'deactive',
    classNameForwardButton: 'deactive',
    classNameSearchBox: 'hidden',
    searchInPageCount: null
  };

  private _searchInPagePrevKeyword: string = null;
  private readonly _injectionCode: {[k: string]: string};

  constructor(props) {
    super(props);

    // injection javascript codes
    const dir = path.resolve(__dirname, './BrowserFragmentAsset/');
    this._injectionCode = {
      style: fs.readFileSync(`${dir}/style.css`).toString(),
      theme: '',
      externalBrowser: fs.readFileSync(`${dir}/external-browser.js`).toString(),
      showDiffBody: fs.readFileSync(`${dir}/show-diff-body.js`).toString(),
      updateBySelf: fs.readFileSync(`${dir}/update-by-self.js`).toString(),
      highlightAndScroll: fs.readFileSync(`${dir}/highlight-and-scroll.js`).toString(),
      contextMenu: fs.readFileSync(`${dir}/context-menu.js`).toString(),
      detectInput: fs.readFileSync(`${dir}/detect-input.js`).toString(),
    };
  }

  componentDidMount() {
    IssueEvent.onSelectIssue(this, (issue, readBody) => this._loadIssue(issue, readBody));
    IssueEvent.onReadIssue(this, issue => {
      if (this.state.issue && issue.id === this.state.issue.id) this.setState({issue});
    });
    IssueEvent.onMarkIssue(this, issue => {
      if (this.state.issue && issue.id === this.state.issue.id) this.setState({issue});
    });
    IssueEvent.addArchiveIssueListener(this, issue => {
      if (this.state.issue && issue.id === this.state.issue.id) this.setState({issue});
    });

    WebViewEvent.onScroll(this, this._handleIssueScroll.bind(this));

    StreamEvent.onOpenStreamSetting(this, ()=> BrowserViewIPC.hide(true));
    StreamEvent.onCloseStreamSetting(this, ()=> BrowserViewIPC.hide(false));
    StreamEvent.onOpenFilteredStreamSetting(this, ()=> BrowserViewIPC.hide(true));
    StreamEvent.onCloseFilteredStreamSetting(this, ()=> BrowserViewIPC.hide(false));

    SystemStreamEvent.onOpenStreamSetting(this, ()=> BrowserViewIPC.hide(true));
    SystemStreamEvent.onCloseStreamSetting(this, ()=> BrowserViewIPC.hide(false));
    SystemStreamEvent.OpenSubscriptionSetting(this, ()=> BrowserViewIPC.hide(true));
    SystemStreamEvent.onCloseSubscriptionSetting(this, ()=> BrowserViewIPC.hide(false));

    {
      electron.ipcRenderer.on('command-webview', (_ev, commandItem)=>{
        this._handleCommand(commandItem);
      });
    }

    this._setupDetectInput();
    this._setupPageLoading();
    this._setupWebContents();
    this._setup404();
    this._setupCSS();
    this._setupContextMenu();
    this._setupConsoleLog();
    this._setupExternalBrowser();
    this._setupUpdateBySelf();
    this._setupHighlightAndScrollLast();
    this._setupShowDiffBody();
    this._setupSearchInPage();
    this._setupSearchBoxInputShiftKey();
  }

  _loadIssue(issue, readBody?) {
    switch (ConfigRepo.getConfig().general.browser) {
      case 'builtin':
        BrowserViewIPC.loadURL(issue.value.html_url);
        break;
      case 'external':
        BrowserViewIPC.loadURL('data://'); // blank page
        shell.openExternal(issue.html_url);
        this.setState({issue: issue});
        return;
      default:
        this.setState({issue: issue});
        return;
    }

    this.setState({
      issue: issue,
      readBody: readBody,
      currentUrl: issue.value.html_url,
      classNameLoading: this.state.currentUrl === issue.value.html_url ? '' : 'loading'
    });
  }

  _isTargetIssuePage() {
    const issueUrl = this.state.issue.html_url;
    const validUrls = [
      issueUrl,
      `${issueUrl}/files`
    ];
    return validUrls.includes(BrowserViewIPC.getURL());
  }

  _isTargetHost() {
    const url = new URL(BrowserViewIPC.getURL());
    return ConfigRepo.getConfig().github.webHost === url.host;
  }

  _setupWebContents() {
    BrowserViewIPC.onEventWillDownload(() => {
      this.setState({classNameLoading: ''});
    });
  }

  _setupDetectInput() {
    BrowserViewIPC.onEventDOMReady(()=>{
      BrowserViewIPC.executeJavaScript(this._injectionCode.detectInput);
    });

    BrowserViewIPC.onEventConsoleMessage((_level, message)=>{
      if (message.indexOf('DETECT_INPUT:') === 0) {
        const res = message.split('DETECT_INPUT:')[1];

        if (res === 'true') {
          AppIPC.keyboardShortcut(false);
        } else {
          AppIPC.keyboardShortcut(true);
        }
      }
    });
  }

  _setupPageLoading() {
    BrowserViewIPC.onEventDidStartLoading(() => {
      this.setState({classNameLoading: 'loading'});
    });

    // todo: consider using did-stop-loading
    BrowserViewIPC.onEventDidNavigate(() => {
      this.setState({
        currentUrl: BrowserViewIPC.getURL(),
        classNameLoading: '',
        classNameBackButton: BrowserViewIPC.canGoBack() ? '' : 'deactive',
        classNameForwardButton: BrowserViewIPC.canGoForward() ? '' : 'deactive'
      });
    });

    BrowserViewIPC.onEventDidNavigateInPage(() => {
      this.setState({
        currentUrl: BrowserViewIPC.getURL(),
        classNameLoading: '',
        classNameBackButton: BrowserViewIPC.canGoBack() ? '' : 'deactive',
        classNameForwardButton: BrowserViewIPC.canGoForward() ? '' : 'deactive'
      });
    });
  }

  _setup404() {
    // webview.addEventListener('did-get-response-details', (evt) =>{
    //   const statusCode = evt.httpResponseCode;
    //   const url = evt.newURL;
    //   if (statusCode === 404 && url === this.state.currentUrl) {
    //     const signInUrl = `https://${Config.getConfig().github.webHost}/login?return_to=${encodeURIComponent(url)}`;
    //     BrowserViewIPC.loadURL(signInUrl)
    //     this.setState({
    //       currentUrl: signInUrl,
    //       classNameLoading: 'loading'
    //     });
    //   }
    // });
  }

  _setupConsoleLog() {
    BrowserViewIPC.onEventConsoleMessage((level, message) => {
      const log = `[webview] ${message}`;
      switch (level) {
        case -1: console.debug(log); break;
        case 0: console.log(log); break;
        case 1: console.warn(log); break;
        case 2: console.error(log); break;
      }
    });
  }

  _setupExternalBrowser() {
    BrowserViewIPC.onEventDOMReady(() => {
      const always = ConfigRepo.getConfig().general.alwaysOpenExternalUrlInExternalBrowser;
      const code = this._injectionCode.externalBrowser.replace('_alwaysOpenExternalUrlInExternalBrowser_', `${always}`);
      BrowserViewIPC.executeJavaScript(code);
    });

    BrowserViewIPC.onEventConsoleMessage((_level, message)=>{
      if (message.indexOf('OPEN_EXTERNAL_BROWSER:') === 0) {
        const url = message.split('OPEN_EXTERNAL_BROWSER:')[1];
        shell.openExternal(url);
      }
    });
  }

  _setupContextMenu() {
    BrowserViewIPC.onEventDOMReady(() => {
      BrowserViewIPC.executeJavaScript(this._injectionCode.contextMenu);
    });

    BrowserViewIPC.onEventConsoleMessage((_level, message)=>{
      if (message.indexOf('CONTEXT_MENU:') !== 0) return;

      const data = JSON.parse(message.split('CONTEXT_MENU:')[1]);

      const menu = new Menu();
      if (data.url) {
        menu.append(new MenuItem({
          label: 'Open browser',
          click: ()=>{
            shell.openExternal(data.url);
          }
        }));

        menu.append(new MenuItem({
          label: 'Copy link',
          click: ()=>{
            clipboard.writeText(data.url);
          }
        }));

        menu.append(new MenuItem({ type: 'separator' }));
      }

      if (data.text) {

        if (UserAgentUtil.isMac()) {
          menu.append(new MenuItem({
            label: 'Search text in dictionary',
            click: ()=> {
              shell.openExternal(`dict://${data.text}`);
            }
          }));

          menu.append(new MenuItem({ type: 'separator' }));
        }

        menu.append(new MenuItem({
          label: 'Copy text',
          click: ()=>{
            clipboard.writeText(data.text);
          }
        }));

        menu.append(new MenuItem({
          label: 'Cut text',
          click: ()=> BrowserViewIPC.cut()
        }));

      }

      menu.append(new MenuItem({
        label: 'Paste text',
        click: ()=> BrowserViewIPC.paste()
      }));

      menu.popup({window: remote.getCurrentWindow()});
    });
  }

  _setupHighlightAndScrollLast() {
    BrowserViewIPC.onEventDOMReady(() => {
      if (!this._isTargetIssuePage()) return;

      // if issue body was updated, does not scroll to last comment.
      let updatedBody = false;
      if (this.state.issue && this.state.readBody) {
        if (this.state.readBody !== this.state.issue.body) updatedBody = true;
      }

      let prevReadAt;
      if (this.state.issue) prevReadAt = new Date(this.state.issue.prev_read_at).getTime();

      const code = this._injectionCode.highlightAndScroll.replace('_prevReadAt_', prevReadAt).replace('_updatedBody_', `${updatedBody}`);
      BrowserViewIPC.executeJavaScript(code);
    });
  }

  _setupShowDiffBody() {
    BrowserViewIPC.onEventDOMReady(() => {
      if (!this._isTargetIssuePage()) return;

      let diffBodyHTMLWord = '';
      let diffBodyHTMLChar = '';
      if (this.state.issue && this.state.readBody) {
        if (this.state.readBody === this.state.issue.body) return;

        // word diff
        {
          const diffBody = jsdiff.diffWords(this.state.readBody, this.state.issue.body);
          diffBody.forEach(function(part){
            const type = part.added ? 'add' :
              part.removed ? 'delete' : 'normal';
            const value = escapeHTML(part.value.replace(/`/g, '\\`'));
            diffBodyHTMLWord += `<span class="diff-body-${type}">${value}</span>`;
          });
        }

        // char diff
        {
          const diffBody = jsdiff.diffChars(this.state.readBody, this.state.issue.body);
          diffBody.forEach(function(part){
            const type = part.added ? 'add' :
              part.removed ? 'delete' : 'normal';
            const value = escapeHTML(part.value.replace(/`/g, '\\`'));
            diffBodyHTMLChar += `<span class="diff-body-${type}">${value}</span>`;
          });
        }
      }

      if (!diffBodyHTMLWord.length) return;

      const code = this._injectionCode.showDiffBody
        .replace('_diffBodyHTML_Word_', diffBodyHTMLWord)
        .replace('_diffBodyHTML_Char_', diffBodyHTMLChar);
      BrowserViewIPC.executeJavaScript(code);
    });

    BrowserViewIPC.onEventConsoleMessage((_level, message)=> {
      if (message.indexOf('OPEN_DIFF_BODY:') !== 0) return;
      GARepo.eventBrowserOpenDiffBody();
    });
  }

  _setupUpdateBySelf() {
    BrowserViewIPC.onEventDOMReady(() => {
      if (!this._isTargetIssuePage()) return;
      const code = this._injectionCode.updateBySelf.replace('_loginName_', ConfigRepo.getLoginName());
      BrowserViewIPC.executeJavaScript(code);
    });

    BrowserViewIPC.onEventDidNavigateInPage(() => {
      if (!this._isTargetIssuePage()) return;
      const code = this._injectionCode.updateBySelf.replace('_loginName_', ConfigRepo.getLoginName());
      BrowserViewIPC.executeJavaScript(code);
    });

    let isRequesting = false;
    BrowserViewIPC.onEventConsoleMessage((_level, message)=>{
      if (!this._isTargetIssuePage()) return;
      if (['UPDATE_BY_SELF:', 'UPDATE_COMMENT_BY_SELF:'].includes(message) === false) return;

      if (isRequesting) return;
      isRequesting = true;

      async function update(issue){
        const github = ConfigRepo.getConfig().github;
        const client = new GitHubClient(github.accessToken, github.host, github.pathPrefix, github.https);
        const repo = issue.repo;
        const number = issue.number;
        const type = issue.type === 'issue' ? 'issues' : 'pulls';

        try {
          const res = await client.request(`/repos/${repo}/${type}/${number}`);
          const updatedIssue = res.body;
          const date = new Date(updatedIssue.updated_at);
          await IssueRepo.updateRead(issue.id, date);
          const res2 = await IssueRepo.updateRead(issue.id, date);
          if (res2.error) return console.error(res2.error);
        } catch (e) {
          console.error(e);
        }

        isRequesting = false;
      }

      update(this.state.issue);
    });
  }

  _setupSearchBoxInputShiftKey() {
    // hack: electron can not handling shiftKey
    ReactDOM.findDOMNode(this).querySelector('#searchBoxInput').addEventListener('keyup', this._handleSearchBox.bind(this));
  }

  _setupCSS() {
    electron.ipcRenderer.on('load-theme-browser', (_event, css)=> {
      this._injectionCode.theme = css;
      if (this._injectionCode.theme) BrowserViewIPC.insertCSS(this._injectionCode.theme);
    });

    BrowserViewIPC.onEventDOMReady(() => {
      if (!this._isTargetHost()) return;
      BrowserViewIPC.insertCSS(this._injectionCode.style);
      if (this._injectionCode.theme) BrowserViewIPC.insertCSS(this._injectionCode.theme);
    });
  }

  _setupSearchInPage() {
    const isMac = UserAgentUtil.isMac();
    BrowserViewIPC.onEventBeforeInput((input)=>{
      if (input.type !== 'keyDown') return;

      let flag;
      if (isMac) {
        flag = input.meta && input.key === 'f'; // cmd + f
      } else {
        flag = input.control && input.key === 'f'; // ctrl + f
      }

      if (flag) {
        this.setState({classNameSearchBox: ''});
        BrowserViewIPC.blur();
        const input = ReactDOM.findDOMNode(this).querySelector('.search-box input');
        input.focus();
        input.selectionStart = 0;
      }
    });

    const state = {active: 0};
    BrowserViewIPC.onEventFoundInPage((result) => {
      if (result.activeMatchOrdinal !== undefined) {
        state.active = result.activeMatchOrdinal;
      }

      if (result.finalUpdate) {
        if (result.matches === 0) state.active = 0;
        this.setState({searchInPageCount: `${state.active} / ${result.matches}`});
      }
    });

    BrowserViewIPC.onEventDidNavigate(() => {
      BrowserViewIPC.stopFindInPage('keepSelection');
      this.setState({classNameSearchBox: 'hidden', searchInPageCount: ''});
    });
  }

  componentWillUnmount() {
    IssueEvent.offAll(this);
    WebViewEvent.offAll(this);
    StreamEvent.offAll(this);
    SystemStreamEvent.offAll(this);
  }

  render() {
    const issue = this.state.issue;
    const readIcon = IssueRepo.isRead(issue) ? 'icon icon-book-open' : 'icon icon-book';
    const markIcon = issue && issue.marked_at ? 'icon icon-star' : 'icon icon-star-empty';
    const archiveIcon = issue && issue.archived_at ? 'icon icon-archive' : 'icon icon-inbox';
    const currentUrl = this.state.currentUrl === 'data://' ? '' : this.state.currentUrl;

    const selectBrowserClassName = ()=> {
      if (this.state.issue && !ConfigRepo.getConfig().general.browser) {
        return 'select-browser';
      } else {
        return 'hidden';
      }
    };

    const externalBrowserClassName = ()=> {
      if (ConfigRepo.getConfig().general.browser === 'external') {
        return 'external-browser';
      } else {
        return 'hidden';
      }
    };

    // judge to hide WebView(BrowserView)
    if (!ConfigRepo.getConfig().general.browser) {
      BrowserViewIPC.hide(true);
    } else if (ConfigRepo.getConfig().general.browser === 'external') {
      BrowserViewIPC.hide(true);
    } else {
      BrowserViewIPC.hide(false);
    }

    return <div className="webview">
      <div className="toolbar toolbar-header">
        <div className="toolbar-actions">

          <div className="btn-group">
            <button title="Back"
                    className={`btn btn-default move-history ${this.state.classNameBackButton}`}
                    onClick={this._handleMoveHistory.bind(this, -1)}>
              <span className="icon icon-left"/>
            </button>
            <button title="Forward"
                    className={`btn btn-default move-history ${this.state.classNameForwardButton}`}
                    onClick={this._handleMoveHistory.bind(this, 1)}>
              <span className="icon icon-right"/>
            </button>
          </div>

          <div className="btn-group url-box">
            <input
              className={`form-control ${this.state.classNameLoading}`}
              value={currentUrl || ''}
              onChange={this._handleChangeURL.bind(this, 'change')}
              onKeyDown={this._handleChangeURL.bind(this, 'keydown')}
              onClick={this._handleClickURL.bind(this)}
            />
          </div>

          <div className="btn-group">
            <button className="btn btn-default" title="Toggle Read" onClick={this._handleIssueAction.bind(this, 'read')}>
              <span className={readIcon}/>
            </button>
            <button className="btn btn-default" title="Toggle Star" onClick={this._handleIssueAction.bind(this, 'mark')} >
              <span className={markIcon}/>
            </button>
            <button className="btn btn-default" title="Toggle Archive" onClick={this._handleIssueAction.bind(this, 'archive')} >
              <span className={archiveIcon}/>
            </button>
            <button className="btn btn-default" title="Open Browser" onClick={this._handleIssueAction.bind(this, 'export')}>
              <span className="icon icon-export"/>
            </button>
          </div>

          <div className={`search-box ${this.state.classNameSearchBox}`}>
            <input id="searchBoxInput" className="form-control"/>
            <span className="count">{this.state.searchInPageCount}</span>
            <span className="icon icon-up-open" onClick={this._handleSearchBoxNav.bind(this, 'back')}/>
            <span className="icon icon-down-open" onClick={this._handleSearchBoxNav.bind(this, 'next')}/>
            <span className="icon icon-cancel" onClick={this._handleSearchBoxNav.bind(this, 'close')}/>
          </div>

        </div>
      </div>

      <div className={selectBrowserClassName()}>
        <div>
          <div>Please select the browser to use when you read the issue.</div>
          <div>You can change this selection in preferences.</div>
          <button className="btn btn-large btn-positive" onClick={this._handleSelectBrowser.bind(this, 'builtin')}>
            Use built-in browser
          </button>
          <span>OR</span>
          <button className="btn btn-large btn-default" onClick={this._handleSelectBrowser.bind(this, 'external')}>
            Use external browser
          </button>
        </div>
      </div>

      <div className={externalBrowserClassName()}>
        <img src="../image/icon-gray.png"/>
        <div className={ConfigRepo.getConfig().general.browser === 'external' ? '' : 'hidden'}>
          <p>You can also change the setting of the browser.</p>
        </div>
      </div>
    </div>;
  }

  _handleChangeURL(command, evt) {
    switch (command) {
      case 'change':
        this.setState({currentUrl: evt.target.value});
        break;
      case 'keydown':
        if (evt.keyCode === 13) { // enter
          const url = evt.target.value;
          BrowserViewIPC.loadURL(url);
          this.setState({
            currentUrl: url,
            classNameLoading: 'loading'
          });
        }
        break;
    }
  }

  _handleClickURL(evt) {
    evt.target.select();
  }

  async _handleIssueAction(command) {
    let issue: IssueEntity = this.state.issue;
    if (!issue) return;

    switch (command) {
      case 'read':
        if (IssueRepo.isRead(issue)) {
          const res = await IssueRepo.updateRead(issue.id, null);
          if (res.error) return console.error(res.error);
          issue = res.issue;
        } else {
          const res = await IssueRepo.updateRead(issue.id, new Date());
          if (res.error) return console.error(res.error);
          issue = res.issue;
        }
        IssueEvent.emitReadIssue(issue);
        break;
      case 'mark':
        if (issue.marked_at) {
          const res = await IssueRepo.updateMark(issue.id, null);
          if (res.error) return console.error(res.error);
          issue = res.issue;
        } else {
          const res = await IssueRepo.updateMark(issue.id, new Date());
          if (res.error) return console.error(res.error);
          issue = res.issue;
        }
        IssueEvent.emitMarkIssue(issue);
        break;
      case 'archive':
        if (issue.archived_at) {
          const res = await IssueRepo.updateArchive(issue.id, null);
          if (res.error) return console.error(res.error);
          issue = res.issue;
        } else {
          const res = await IssueRepo.updateArchive(issue.id, new Date());
          if (res.error) return console.error(res.error);
          issue = res.issue;
        }
        IssueEvent.emitArchiveIssue(issue);
        break;
      case 'export':
        const url = BrowserViewIPC.getURL();
        shell.openExternal(url);
        break;
    }

    this.setState({issue});
  }

  _handleIssueScroll(direction) {
    if (direction > 0) {
      BrowserViewIPC.executeJavaScript('window.scrollBy(0, 40)');
    } else {
      BrowserViewIPC.executeJavaScript('window.scrollBy(0, -40)');
    }
  }

  _handleSearchBoxNav(command) {
    switch (command) {
      case 'back':
        BrowserViewIPC.findInPage(this._searchInPagePrevKeyword, {forward: false});
        break;
      case 'next':
        BrowserViewIPC.findInPage(this._searchInPagePrevKeyword, {findNext: true});
        break;
      case 'close':
        this._searchInPagePrevKeyword = '';
        BrowserViewIPC.stopFindInPage('keepSelection');
        BrowserViewIPC.focus();
        this.setState({classNameSearchBox: 'hidden', searchInPageCount: ''});
        break;
    }
  }

  _handleSearchBox(evt) {
    const keyword = evt.target.value;

    if (evt.keyCode === 27) { // escape
      this._searchInPagePrevKeyword = '';
      BrowserViewIPC.stopFindInPage('keepSelection');
      BrowserViewIPC.focus();
      this.setState({classNameSearchBox: 'hidden', searchInPageCount: ''});
      return;
    }

    if (!keyword) {
      this._searchInPagePrevKeyword = '';
      BrowserViewIPC.stopFindInPage('clearSelection');
      this.setState({searchInPageCount: ''});
      return;
    }

    if (evt.keyCode === 13) { // enter
      this._searchInPagePrevKeyword = keyword;
      if (evt.shiftKey) {
        BrowserViewIPC.findInPage(keyword, {forward: false});
      } else {
        BrowserViewIPC.findInPage(keyword, {findNext: true});
      }
      return;
    }

    if (keyword !== this._searchInPagePrevKeyword) {
      this._searchInPagePrevKeyword = keyword;
      BrowserViewIPC.findInPage(keyword);
    }
  }

  _handleMoveHistory(direction) {
    if (direction > 0 && BrowserViewIPC.canGoForward()) {
      BrowserViewIPC.goForward();
    } else if(direction < 0 && BrowserViewIPC.canGoBack()) {
      BrowserViewIPC.goBack();
    } else {
      return;
    }

    const url = BrowserViewIPC.getURL();
    this.setState({
      currentUrl: url,
      classNameLoading: 'loading'
    });
  }

  _handleSelectBrowser(browser) {
    ConfigRepo.setGeneralBrowser(browser);

    const issue = this.state.issue;
    if (!issue) return;

    switch (browser) {
      case 'builtin':
        const signInUrl = `https://${ConfigRepo.getConfig().github.webHost}/login?return_to=${encodeURIComponent(issue.html_url)}`;
        BrowserViewIPC.loadURL(signInUrl);
        this.setState({
          currentUrl: signInUrl,
          classNameLoading: 'loading'
        });
        break;
      case 'external':
        this._loadIssue(issue);
        break;
    }
  }

  _handleCommand(commandItem) {
    const command = commandItem.command;
    switch (command) {
      case 'reload':
        BrowserViewIPC.reload();
        break;
      case 'back':
        this._handleMoveHistory(-1);
        break;
      case 'forward':
        this._handleMoveHistory(1);
        break;
      case 'scroll_down':
        this._handleIssueScroll(1);
        break;
      case 'scroll_up':
        this._handleIssueScroll(-1);
        break;
      case 'read':
        this._handleIssueAction('read');
        break;
      case 'mark':
        this._handleIssueAction('mark');
        break;
      case 'archive':
        this._handleIssueAction('archive');
        break;
      case 'export':
        this._handleIssueAction('export');
        break;
      case 'open_location':{
        const el = ReactDOM.findDOMNode(this).querySelector('.toolbar.toolbar-header .url-box input');
        el.focus();
        el.select();
        break;
      }
    }
  }
}