import React from 'react';
import {FilterHistoryRepo} from '../../Repository/FilterHistoryRepo';
import styled from 'styled-components';
import {View} from '../../Library/View/View';
import {TextInput} from '../../Library/View/TextInput';
import {space} from '../../Library/Style/layout';
import {IssueIPC} from '../../../IPC/IssueIPC';

type Props = {
  filterQuery: string,
  onExec: (filterQuery: string) => void;
}

type State = {
  filterQuery: string;
  filterHistories: string[];
}

export class IssueFilterFragment extends React.Component<Props, State> {
  state: State = {
    filterQuery: this.props.filterQuery,
    filterHistories: [],
  }

  private textInput: TextInput;

  componentDidMount() {
    this.loadFilterHistories();
    IssueIPC.onFocusFilter(() => this.textInput.focus());
  }

  componentDidUpdate(prevProps: Readonly<Props>, _prevState: Readonly<State>, _snapshot?: any) {
    if (this.props.filterQuery !== prevProps.filterQuery) {
      this.setState({filterQuery: this.props.filterQuery});
    }
  }

  private async loadFilterHistories() {
    const {error, filterHistories} = await FilterHistoryRepo.getFilterHistories(10);
    if (error) return console.error(error);

    this.setState({filterHistories: filterHistories.map(v => v.filter)});
  }

  private async handleExec() {
    const filterQuery = this.state.filterQuery;
    this.props.onExec(filterQuery);

    if (filterQuery) {
      const {error} = await FilterHistoryRepo.createFilterHistory(filterQuery);
      if (error) return console.error(error);
      await this.loadFilterHistories();
    }
  }

  render() {
    return (
      <Root>
        <FilterInputWrap>
          <TextInput
            ref={ref => this.textInput = ref}
            value={this.state.filterQuery}
            onChange={t => this.setState({filterQuery: t})}
            onClear={() => this.setState({filterQuery: ''}, () => this.handleExec())}
            onEnter={() => this.handleExec()}
            onSelectCompletion={t => this.setState({filterQuery: t}, () => this.handleExec())}
            onFocusCompletion={t => this.setState({filterQuery: t})}
            placeholder='is:open octocat'
            completions={this.state.filterHistories}
            showClearButton='ifNeed'
          />
        </FilterInputWrap>
      </Root>
    );
  }
}

const Root = styled(View)`
  /* filter historyを表示するため */
  overflow: visible;
`;

const FilterInputWrap = styled(View)`
  /* filter historyを表示するため */
  overflow: visible;
  
  padding: ${space.medium}px;
`;
