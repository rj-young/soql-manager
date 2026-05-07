import { IsNotEmpty, IsString } from "class-validator"
import { Entity, Column, BeforeInsert, BeforeUpdate, ManyToOne, JoinColumn } from "typeorm"
import { ApplicationEntity } from './application_entity'
import { loadEncryptionKey } from '../../encryption_key'
import { ConnectionString } from 'connection-string'
import log from '@bksLogger'
import { AzureCredsEncryptTransformer, EncryptTransformer, SurrealDbEncryptTransformer } from '../transformers/Transformers'
import { IConnection, SshMode } from '@/common/interfaces/IConnection'
import { AzureAuthOptions, BigQueryOptions, CassandraOptions, ConnectionType, ConnectionTypes, LibSQLOptions, RedshiftOptions, IamAuthOptions, SQLAnywhereOptions, SurrealDBOptions } from "@/lib/db/types"
import { resolveHomePathToAbsolute } from "@/handlers/utils"
import { ReadOnlyOrDefault } from "../validators/ReadOnlyOrDefault"
import { ConnectionFolder } from './ConnectionFolder'

const encrypt = new EncryptTransformer(loadEncryptionKey())
const azureEncrypt = new AzureCredsEncryptTransformer(loadEncryptionKey())
const surrealEncrypt = new SurrealDbEncryptTransformer(loadEncryptionKey())

export interface ConnectionOptions {
  cluster?: string
  jwtAuthEnabled?: boolean
  connectionMethod?: 'manual' | 'connectionString'
  connectionString?: string
}

function parseConnectionType(t: Nullable<ConnectionType>) {
  // SOQL Manager: only `salesforce` is recognized. Phase 1 cleanse narrowed
  // the union; legacy values from existing dev installs map to null.
  if (!t) return null
  const allowed = ConnectionTypes.map(c => c.value)
  return allowed.includes(t) ? t : null
}

export class DbConnectionBase extends ApplicationEntity {
  withProps(_props?: any): DbConnectionBase {
    return this;
  }

  _connectionType: Nullable<ConnectionType> = null

  @Column({ type: 'varchar', name: 'connectionType' })
  public set connectionType(value: Nullable<ConnectionType>) {
    if (this._connectionType !== value) {
      const changePort = this._port === this.defaultPort
      this._connectionType = parseConnectionType(value)
      this._port = changePort ? this.defaultPort : this._port
    }
  }

  public get connectionType() {
    return this._connectionType
  }

  @Column({ type: "varchar", nullable: true })
  host = 'localhost'

  _port: Nullable<number> = null

  @Column({ type: "int", nullable: true })
  public set port(v: Nullable<number>) {
    this._port = v
  }

  public get port(): Nullable<number> {
    return this._port
  }

  public get defaultPort() : Nullable<number> {
    // No SQL ports applicable. OAuth loopback redirect runs on a fixed port
    // (1717) handled by the OAuth flow, not the saved-connection model.
    return null
  }

  _socketPath: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true })
  public set socketPath(v: Nullable<string>) {
    this._socketPath = v
  }

  public get socketPath(): Nullable<string> {
    return this._socketPath || this.defaultSocketPath
  }

  public get defaultSocketPath(): Nullable<string> {
    // No DB socket path concept for Salesforce.
    return null
  }

  @Column({ type: 'boolean', nullable: false, default: false })
  socketPathEnabled = false

  @Column({ type: "varchar", nullable: true })
  username: Nullable<string> = null

  @Column({ type: "varchar", nullable: true })
  domain: Nullable<string> = null

  @Column({ type: "varchar", nullable: true })
  defaultDatabase: Nullable<string> = null

  @Column({ type: "varchar", nullable: true, transformer: [encrypt] })
  url: Nullable<string> = null

  @Column({ type: "varchar", length: 500, nullable: false })
  uniqueHash = "DEPRECATED"

  @Column({ type: 'boolean', nullable: false, default: false })
  sshEnabled = false

  @Column({ type: "varchar", nullable: true })
  sshHost: Nullable<string> = null

  @Column({ type: "int", nullable: true })
  sshPort: Nullable<number> = null

  @Column({ type: "varchar", nullable: true })
  sshKeyfile: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true })
  sshUsername: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true })
  sshBastionHost: Nullable<string> = null

  @Column({ type: 'int', nullable: true })
  sshBastionHostPort: Nullable<number> = null

  @Column({ type: 'varchar', length: 8, nullable: false, default: 'agent' })
  sshBastionMode: SshMode = 'agent'

  @Column({ type: 'varchar', nullable: true })
  sshBastionUsername: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true })
  sshBastionKeyfile: Nullable<string> = null

  @Column({ type: 'int', nullable: true })
  sshKeepaliveInterval: Nullable<number> = 60

  @Column({ type: 'boolean', nullable: false, default: false })
  ssl = false

  @Column({ type: 'varchar', nullable: true })
  sslCaFile: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true })
  sslCertFile: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true })
  sslKeyFile: Nullable<string> = null

  // this only takes effect if SSL certs are provided
  @Column({ type: 'boolean', nullable: false })
  sslRejectUnauthorized = true

  @ReadOnlyOrDefault()
  @Column({type: 'boolean', nullable: false, default: false})
  readOnlyMode = true

  // Used for Oracle only
  @Column({ type: 'simple-json', nullable: false })
  options: ConnectionOptions = { connectionMethod: 'manual' }

  @Column({ type: 'simple-json', nullable: false })
  redshiftOptions: RedshiftOptions = {}

  @Column({type: 'simple-json', nullable: false})
  cassandraOptions: CassandraOptions = {}

  @Column({ type: 'simple-json', nullable: false })
  bigQueryOptions: BigQueryOptions = {}

  @Column({ type: 'simple-json', nullable: false, transformer: [azureEncrypt]})
  azureAuthOptions: AzureAuthOptions = {}

  @Column({ type: 'simple-json', nullable: false, transformer: [azureEncrypt]})
  iamAuthOptions: IamAuthOptions = {}

  @Column({ type: 'integer', nullable: true})
  authId: Nullable<number> = null

  @Column({ type: 'simple-json', nullable: false })
  libsqlOptions: LibSQLOptions = { mode: 'url' }

  @Column({ type: 'simple-json', nullable: false })
  sqlAnywhereOptions: SQLAnywhereOptions = { mode: 'server' }

  @Column({ type: 'simple-json', nullable: false, transformer: [surrealEncrypt] })
  surrealDbOptions: SurrealDBOptions = {};

  // this is only for SQL Server.
  @Column({ type: 'boolean', nullable: false })
  trustServerCertificate = false

  // oracle only.
  @Column({type: 'varchar', nullable: true})
  serviceName: Nullable<string> = null
}

@Entity({ name: 'saved_connection' })
export class SavedConnection extends DbConnectionBase implements IConnection {

  withProps(props?: any): SavedConnection {

    if (props) {
      if (props.connectionType) {
        this.connectionType = props.connectionType;
      }
      SavedConnection.merge(this, props);
    }

    if (!this.createdAt) {
      this.createdAt = new Date();
    }

    if (!this.updatedAt) {
      this.updatedAt = new Date();
    }

    return this;
  }

  @IsString({ message: 'Name is required' })
  @IsNotEmpty({ message: 'Name is required' })
  @Column("varchar")
  name!: string

  @Column({
    type: 'varchar',
    nullable: true,
    default: null
  })
  labelColor?: string = 'default'

  @Column({ update: false, default: -1, type: 'integer' })
  workspaceId = -1

  @Column({ type: 'boolean', default: true })
  rememberPassword = true

  @Column({type: 'boolean', default: false})
  readOnlyMode = false

  @Column({ type: 'integer', nullable: true, default: null })
  connectionFolderId: Nullable<number> = null

  @Column({ type: 'float', nullable: false, default: 0 })
  position = 0.0

  // Do NOT initialize this to null. A null initializer becomes an own property
  // that gets copied into transport objects by cls.merge(), and TypeORM treats an
  // explicitly-null relation as "unset this FK", overriding the connectionFolderId column.
  @ManyToOne(() => ConnectionFolder, (folder) => folder.connections, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connectionFolderId' })
  connectionFolder?: ConnectionFolder

  @Column({type: 'varchar', nullable: true, transformer: [encrypt]})
  password: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true, transformer: [encrypt] })
  sshKeyfilePassword: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true, transformer: [encrypt] })
  sshPassword: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true, transformer: [encrypt] })
  sshBastionPassword: Nullable<string> = null

  @Column({ type: 'varchar', nullable: true, transformer: [encrypt] })
  sshBastionKeyfilePassword: Nullable<string> = null

  _sshMode: SshMode = "agent"

  @Column({ name: "sshMode", type: "varchar", length: "8", nullable: false, default: "agent" })
  set sshMode(value: SshMode) {
    this._sshMode = value
    if (this._sshMode !== 'userpass') {
      this.sshPassword = null
    }

    if (this._sshMode !== 'keyfile') {
      this.sshKeyfile = null
      this.sshKeyfilePassword = null
    }

    if (this._sshMode === 'keyfile' && !this.sshKeyfile) {
      this.sshKeyfile = resolveHomePathToAbsolute("~/.ssh/id_rsa")
    }

    if (!this.sshKeepaliveInterval || this.sshKeepaliveInterval < 0) {
      // store null if zero, empty or negative
      this.sshKeepaliveInterval = null
    }
  }

  get sshMode(): SshMode {
    return this._sshMode
  }

  private smellsLikeUrl(url: string): boolean {
    return url.includes("://")
  }

  parse(_url: string): boolean {
    // Connection-string parsing was for SQL dialects (Postgres, SQL Server,
    // SQLite file paths, Cockroach JWT options, etc.). Salesforce uses a
    // My Domain URL captured directly in the connection dialog (Phase 2
    // Task 2.3). The IPC `appdb/saved/parseUrl` handler stays wired but
    // always reports failure until Phase 2 replaces this method.
    return false
  }

  @BeforeInsert()
  @BeforeUpdate()
  maybeClearPasswords(): void {
    if (!this.rememberPassword) {
      this.password = null
      this.sshPassword = null
      this.sshKeyfilePassword = null
      this.sshBastionPassword = null
      this.sshBastionKeyfilePassword = null
    }
  }

}
