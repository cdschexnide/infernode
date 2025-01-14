import { Request, Response, NextFunction } from 'express';
import process from 'process';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs-extra';
import { InfernodeError } from '../utils/globalErrorHandler';
import logger from '../utils/logging';

type ProcessInfo = {
  userId: number | null; // Can remove null as an option when auth is implemented
};

type ReqBody = {
  filePath: string;
};

type BodyWithPid = {
  pid?: number;
};

// note reqBody and Reqbody are not the same thing
function isReqBody(reqBody: ReqBody | object): reqBody is ReqBody {
  const hasFilePath = 'filePath' in reqBody && typeof reqBody.filePath === 'string';
  if (hasFilePath) return true;
  return false;
}

class ApplicationController {
  private runningProcesses: { [pid: number]: ProcessInfo } = {};

  private startProcess(pid: number) {
    this.runningProcesses[pid] = {
      userId: null,
    };
  }

  private endProcess(pid: number) {
    delete this.runningProcesses[pid];
  }

  public getStatus = (req: Request, res: Response, next: NextFunction) => {
    const reqBody = req.body as object | BodyWithPid;
    if (!('pid' in reqBody) || typeof reqBody.pid !== 'number') {
      return next(new InfernodeError(
        'There was an issue with the pid given to getStatus via req.body',
        'check req.body',
        500,
        'Application Controller',
      ));
    }
    res.locals.status = reqBody.pid in this.runningProcesses;
    logger.debug(`Answering request for getStatus of process ${reqBody.pid}: ${JSON.stringify(res.locals?.status)}`);
    return next();
  };

  public nodeLaunch = (req: Request, res: Response, next: NextFunction): void => {
    // receive executable filepath and second from user
    const reqBody = req.body as ReqBody | object;
    if (!isReqBody(reqBody)) {
      return next(new InfernodeError(
        'something failed while verifying req.body',
        'user submitted invalid file path',
        500,
        'Application Controller',
      ));
    }
    try {
      // const filePath: string = path.resolve(__dirname, `${reqBody.filePath}`);
      // res.locals.filePath = filePath;
      if (reqBody.filePath[0] === '/') reqBody.filePath = reqBody.filePath.substring(1);
      // indernode is being run from node_modules since it is an npm package
      // this makes providing a relative path easier for the user
      const filePath = path.join(__dirname, '../../../../', reqBody.filePath);
      if (!existsSync(filePath)) {
        logger.warn(`specified node app does not exist: ${filePath}`);
      }
      const nodePath = execSync('which node').toString().replace(/(\r\n|\n|\r)/gm, '');
      logger.debug(`${nodePath} ${filePath}`);
      const result = spawn(`${nodePath}`, [filePath]);
      // result will be a child process
      result.on('spawn', () => {
        const { pid } = result;
        res.locals.pid = pid;
        logger.debug('child process started - pid:', pid);
        if (pid === undefined) throw new Error('Something is wrong with the pid');
        this.startProcess(pid);
        return next();
      });

      result.on('exit', () => {
        // no matter how the process ends, either on its own or from a command
        // this will run when the child process terminates
        if (typeof res.locals.pid !== 'number') throw new Error();
        this.endProcess(res.locals.pid);
        logger.debug('child process exited gracefully - pid:', res.locals.pid);
      });
      result.on('error', (err) => {
        logger.warn('failed to spawn child process');
        logger.warn(err);
      });
    } catch (err) {
      return next(new InfernodeError(
        'something failed while launching the app via node',
        'something broke in the DtraceController middleware',
        500,
        'nodeLaunch',
      ));
    }
    return undefined;
  };

  public nodeKill = (req: Request, res: Response, next: NextFunction) => {
    try {
      const reqBody = req.body as BodyWithPid;
      const resLocals = res.locals as BodyWithPid;
      if ('pid' in reqBody) {
        if (typeof reqBody.pid !== 'number') {
          throw new Error();
        }
      }
      let pid;
      if ('pid' in reqBody || 'pid' in resLocals) {
        pid = 'pid' in reqBody ? reqBody.pid : resLocals.pid;
      } else {
        throw new Error();
      }
      // check if node process is currently running
      // if not, return an error
      if (typeof pid !== 'number') throw new TypeError('Incorrect type passed in to req.body');
      if (pid in this.runningProcesses) {
        const result = process.kill(pid);
        logger.debug('child process killed?', result, ' - pid: ', pid);
        return next();
      }
      return next({
        userMessage: 'attempted to stop process that is not running',
        message: 'Process not found in runningProcesses',
        controller: 'application.Controller',
        httpStatus: 412,
      });
    } catch (err) {
      return next({
        userMessage: 'something went wrong with the nodeStop command',
        message: 'check your application controller',
        controller: 'application.Controller',
      });
    }
  };
}

export default new ApplicationController();
