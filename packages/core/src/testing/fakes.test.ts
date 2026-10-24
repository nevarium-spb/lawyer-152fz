import { createInMemoryNormRepository } from './fakes';
import { describeNormRepositoryContract } from './norm-repository-contract';

describeNormRepositoryContract('фейк в памяти', (norms) => createInMemoryNormRepository(norms));
