import {Event} from '../Library/Infra/Event';
import {IssueEntity} from '../Library/Type/IssueEntity';
import {StreamEntity} from '../Library/Type/StreamEntity';

const EventNames = {
  SelectStream: 'SelectStream',
  SelectLibraryFirstStream: 'SelectLibraryFirstStream',
  UpdateStreamIssues: 'UpdateStreamIssues',
  ReloadAllStreams: 'ReloadAllStreams'
};

class _StreamEvent {
  private readonly event = new Event();

  offAll(owner) {
    this.event.offAll(owner);
  }

  // select stream
  emitSelectStream(stream: StreamEntity, issue: IssueEntity = null) {
    this.event.emit(EventNames.SelectStream, stream, issue);
  }

  onSelectStream(owner: any, handler: (stream: StreamEntity, issue: IssueEntity) => void) {
    this.event.on(EventNames.SelectStream, owner, handler);
  }

  // select library first stream
  emitSelectLibraryFirstStream() {
    this.event.emit(EventNames.SelectLibraryFirstStream);
  }

  onSelectLibraryFirstStream(owner: any, handler: () => void) {
    return this.event.on(EventNames.SelectLibraryFirstStream, owner, handler);
  }

  // update stream issues
  emitUpdateStreamIssues(streamId: number, updatedIssueIds: number[]) {
    this.event.emit(EventNames.UpdateStreamIssues, streamId, updatedIssueIds);
  }

  onUpdateStreamIssues(owner: any, handler: (streamId: number, updatedIssueIds: number[]) => void) {
    return this.event.on(EventNames.UpdateStreamIssues, owner, handler);
  }

  // reload all streams
  emitReloadAllStreams() {
    this.event.emit(EventNames.ReloadAllStreams);
  }

  onReloadAllStreams(owner, handler: () => void) {
    return this.event.on(EventNames.ReloadAllStreams, owner, handler);
  }
}

export const StreamEvent = new _StreamEvent();
