import React from 'react';
import styled from 'styled-components';
import {border, font, fontWeight, space} from '../../Style/layout';
import {BrowserViewIPC} from '../../../IPC/BrowserViewIPC';
import {Button} from '../../Component/Button';
import {TextInput} from '../../Component/TextInput';
import {CheckBox} from '../../Component/CheckBox';
import {GitHubClient} from '../../Infra/GitHubClient';
import {TimerUtil} from '../../Util/TimerUtil';
import {ConfigType} from '../../../Type/ConfigType';
import {AppIPC} from '../../../IPC/AppIPC';
import {Link} from '../../Component/Link';
import {View} from '../../Component/VIew';
import {appTheme} from '../../Style/appTheme';
import {TouchView} from '../../Component/TouchView';
import {Image} from '../../Component/Image';
import {Text} from '../../Component/Text';

type Props = {
  show: boolean;
  closable?: boolean;
  onClose(github?: ConfigType['github']): void;
}

type State = {
  step: 'githubHost' | 'accessToken' | 'confirm';
  githubType: 'github' | 'ghe';
  host: string;
  pathPrefix: string;
  webHost: string;
  https: boolean;
  accessToken: string;
  loading: boolean;
  connectionTestMessage: string;
  connectionTestResult: boolean;
}

export class ModalAccountSetupFragment extends React.Component<Props, State> {
  state: State = {
    step: 'githubHost',
    githubType: null,
    host: '',
    pathPrefix: '',
    webHost: '',
    https: true,
    accessToken: '',
    loading: false,
    connectionTestMessage: '',
    connectionTestResult: null,
  }

  private lock: boolean;

  private async handleOpenGitHubCheckAccess() {
    await AppIPC.openNewWindow(this.state.webHost, this.state.https);
    await this.handleConnectionTest();
  }

  private async handleConnectionTest() {
    if (!this.state.host) return;
    if (!this.state.accessToken) return;
    if (!this.state.webHost) return;
    if (this.lock) return;

    this.lock = true;
    this.setState({loading: true, connectionTestResult: null, connectionTestMessage: 'connection...'});

    // connection
    const client = new GitHubClient(this.state.accessToken, this.state.host, this.state.pathPrefix, this.state.https);
    const {body, error} = await client.request('/user');
    this.lock = false;

    // error
    if (error) {
      this.setState({loading: false, connectionTestResult: false, connectionTestMessage: 'connection fail'});
      console.error(error);
      return;
    }

    // finish
    this.setState({loading: false, connectionTestMessage: `Hello ${body.login}`});
    await TimerUtil.sleep(1000);

    const github: ConfigType['github'] = {
      accessToken: this.state.accessToken,
      host: this.state.host,
      https: this.state.https,
      webHost: this.state.webHost,
      pathPrefix: this.state.pathPrefix,
      interval: 10,
    };

    this.props.onClose(github);
    BrowserViewIPC.hide(false);
  }

  private handleSelectGitHubCom() {
    this.setState({step: 'accessToken', githubType: 'github', host: 'api.github.com', webHost: 'github.com', https: true});
  }

  private handleSelectGHE() {
    this.setState({githubType: 'ghe'});
  }

  private handleInputGHEHost(host: string) {
    this.setState({host, webHost: host, pathPrefix: '/api/v3/'});
  }

  private handleClose() {
    this.props.onClose();
    BrowserViewIPC.hide(false);
  }

  render() {
    if (!this.props.show) return null;

    BrowserViewIPC.hide(true);

    return (
      <Root>
        {this.renderSide()}
        {this.renderGitHubHost()}
        {this.renderAccessToken()}
        {this.renderConfirm()}
      </Root>
    );
  }

  renderSide() {
    return (
      <Side>
        <SideRow
          className={this.state.step === 'githubHost' ? 'active' : ''}
          onTouch={() => this.setState({step: 'githubHost'})}
        >
          1. Select GitHub Host
        </SideRow>

        <SideRow
          className={this.state.step === 'accessToken' ? 'active' : ''}
          onTouch={() => this.setState({step: 'accessToken'})}
        >
          2. Personal Access Token
        </SideRow>

        <SideRow
          className={this.state.step === 'confirm' ? 'active' : ''}
          onTouch={() => this.setState({step: 'confirm'})}
        >
          3. Confirm
        </SideRow>

        <View style={{padding: space.medium, display: this.props.closable ? null : 'none'}}>
          <Button onClick={this.handleClose.bind(this)} style={{width: '100%'}}>Close</Button>
        </View>
      </Side>
    );
  }

  renderGitHubHost() {
    const display = this.state.step === 'githubHost' ? null : 'none';
    return (
      <Body style={{display}}>
        <Row>
          <Button onClick={() => this.handleSelectGitHubCom()} style={{width: 160, marginRight: space.medium}}>GitHub (github.com)</Button>
          Use standard GitHub (github.com).
        </Row>
        <Space/>

        <Row>
          <Button onClick={() => this.handleSelectGHE()} style={{width: 160, marginRight: space.medium}}>GitHub Enterprise</Button>
          Use GitHub Enterprise.
        </Row>
        <Space/>

        {this.renderGHE()}
      </Body>
    );
  }

  renderGHE() {
    if (this.state.githubType !== 'ghe') return;

    return (
      <React.Fragment>
        <BodyLabel>Please enter your GitHub Enterprise host.</BodyLabel>
        <TextInput value={this.state.host} onChange={ev => this.handleInputGHEHost(ev.target.value)} placeholder='ghe.example.com'/>
        <Space/>

        <Row>
          <CheckBox checked={this.state.https} onChange={ev => this.setState({https: ev.target.checked})}/>
          <BodyLabel style={{paddingLeft: space.medium}}>Use HTTPS</BodyLabel>
        </Row>
        <Space/>
        <Space/>

        <Button onClick={() => this.state.host && this.setState({step: 'accessToken'})}>OK</Button>
      </React.Fragment>
    );
  }

  renderAccessToken() {
    const display = this.state.step === 'accessToken' ? null : 'none';

    const url = `http${this.state.https ? 's' : ''}://${this.state.webHost}/settings/tokens`;
    return (
      <Body style={{display}}>
        <BodyLabel>Please enter your <Link url={url}>personal-access-token</Link> of GitHub.</BodyLabel>
        <Text style={{fontSize: font.small}}>GitHub → Settings → Developer settings → Personal access tokens → Generate new token</Text>
        <Row>
          <TextInput
            style={{marginRight: space.medium}}
            value={this.state.accessToken}
            onChange={ev => this.setState({accessToken: ev.target.value})}
            onEnter={() => this.state.accessToken && this.setState({step: 'confirm'})}
          />
          <Button onClick={() => this.state.accessToken && this.setState({step: 'confirm'})}>OK</Button>
        </Row>

        <Space/>

        <Text>Jasper requires <Text style={{fontWeight: fontWeight.bold}}> repo </Text> and <Text style={{fontWeight: fontWeight.bold}}>user</Text> scopes.</Text>
        <ImageWrap>
          <Image source={{url: '../image/token-setting.png'}}/>
        </ImageWrap>
      </Body>
    );
  }

  renderConfirm() {
    const display = this.state.step === 'confirm' ? null : 'none';

    let loadingView;
    if (this.state.loading) {
      loadingView = (
        <iframe style={{width: 20, height: 20, border: 'none', marginRight: space.medium}} src="../../asset/html/spin.html"/>
      );
    }

    let testFailView;
    if (this.state.connectionTestResult === false) {
      testFailView = (
        <View>
          <Text>Fail requesting to GitHub/GHE. Please check settings, network, VPN, ssh-proxy and more.</Text>
          <Link onClick={this.handleOpenGitHubCheckAccess.bind(this)}>Open GitHub/GHE to check access</Link>
        </View>
      );
    }

    return (
      <Body style={{display}}>
        <BodyLabel>API Host</BodyLabel>
        <TextInput value={this.state.host} onChange={ev => this.setState({host: ev.target.value})}/>
        <Space/>

        <BodyLabel>Access Token</BodyLabel>
        <TextInput value={this.state.accessToken} onChange={ev => this.setState({accessToken: ev.target.value})}/>
        <Space/>

        <BodyLabel>Path Prefix</BodyLabel>
        <TextInput value={this.state.pathPrefix} onChange={ev => this.setState({pathPrefix: ev.target.value})}/>
        <Space/>

        <BodyLabel>Web Host</BodyLabel>
        <TextInput value={this.state.webHost} onChange={ev => this.setState({webHost: ev.target.value})}/>
        <Space/>

        <Row>
          <CheckBox checked={this.state.https} onChange={ev => this.setState({https: ev.target.checked})}/>
          <BodyLabel style={{paddingLeft: space.medium}}>Use HTTPS</BodyLabel>
        </Row>
        <Space/>

        <Row>
          {loadingView}
          {this.state.connectionTestMessage}
          <div style={{flex: 1}}/>
          <Button onClick={() => this.handleConnectionTest()}>OK</Button>
        </Row>

        <Space/>

        {testFailView}

      </Body>
    );
  }
}

const Root = styled(View)`
  position: fixed;
  left: 0;
  top: 0;
  background-color: ${() => appTheme().bg};
  width: 100vw;
  height: 100vh;
  border-radius: 4px;
  overflow: hidden;
  z-index: 9999;
  flex-direction: row;
`;

// side
const Side = styled(View)`
  background-color: ${() => appTheme().bgSide};
  width: 200px;
  border: solid ${border.medium}px ${() => appTheme().borderColor};
`;

const SideRow = styled(TouchView)`
  flex-direction: row;
  align-items: center;
  cursor: pointer;
  padding: ${space.medium}px;
  
  &.active {
    background-color: ${() => appTheme().bgSideSelect};
  }
`;

// body
const Body = styled(View)`
  flex: 1;
  padding: ${space.large}px;
  max-width: 600px;
  height: 100%;
`;

const BodyLabel = styled(View)`
  padding-right: ${space.medium}px;
  flex-direction: row;
`;

const Row = styled(View)`
  flex-direction: row;
  align-items: center;
`;

const Space = styled(View)`
  height: ${space.large}px;
`;

const ImageWrap = styled(View)`
  border: solid ${border.medium}px ${() => appTheme().borderColor};
  border-radius: 4px;
  overflow: scroll;
`;
