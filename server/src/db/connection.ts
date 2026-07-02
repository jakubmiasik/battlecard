import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;

  const config: sql.config = {
    server: process.env.SQL_SERVER || process.env.DB_SERVER!,
    database: process.env.SQL_DATABASE || process.env.DB_NAME || 'battlecard',
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };

  pool = await sql.connect(config);
  return pool;
}

export async function initDb(): Promise<void> {
  const p = await getPool();
  await runMigrations(p);
}

async function runMigrations(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppUsers')
    CREATE TABLE AppUsers (
      id INT IDENTITY(1,1) PRIMARY KEY,
      entraObjectId NVARCHAR(128) NULL,
      email NVARCHAR(256) NOT NULL,
      displayName NVARCHAR(256) NOT NULL,
      role NVARCHAR(20) NOT NULL DEFAULT 'explorer',
      createdAt DATETIME2 DEFAULT GETUTCDATE(),
      updatedAt DATETIME2 DEFAULT GETUTCDATE()
    );
  `);

  await pool.request().query(`
    DECLARE @constraintName NVARCHAR(128);

    SELECT TOP 1 @constraintName = kc.name
    FROM sys.key_constraints kc
    INNER JOIN sys.index_columns ic
      ON ic.object_id = kc.parent_object_id
      AND ic.index_id = kc.unique_index_id
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id
      AND c.column_id = ic.column_id
    WHERE kc.parent_object_id = OBJECT_ID(N'AppUsers')
      AND kc.[type] = 'UQ'
      AND c.name = 'entraObjectId';

    IF @constraintName IS NOT NULL
    BEGIN
      EXEC('ALTER TABLE AppUsers DROP CONSTRAINT [' + @constraintName + ']');
    END

    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'AppUsers')
        AND name = 'entraObjectId'
        AND is_nullable = 0
    )
    BEGIN
      ALTER TABLE AppUsers ALTER COLUMN entraObjectId NVARCHAR(128) NULL;
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'AppUsers')
        AND name = 'UX_AppUsers_entraObjectId_not_null'
    )
    BEGIN
      CREATE UNIQUE INDEX UX_AppUsers_entraObjectId_not_null
      ON AppUsers (entraObjectId)
      WHERE entraObjectId IS NOT NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE Name = N'status' AND Object_ID = Object_ID(N'AppUsers')
    )
    BEGIN
      ALTER TABLE AppUsers ADD status NVARCHAR(20) NOT NULL CONSTRAINT DF_AppUsers_status DEFAULT 'active';
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Technologies')
    CREATE TABLE Technologies (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(256) NOT NULL,
      description NVARCHAR(MAX),
      createdBy INT,
      isGlobal BIT DEFAULT 0,
      createdAt DATETIME2 DEFAULT GETUTCDATE()
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Categories')
    CREATE TABLE Categories (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(128) NOT NULL UNIQUE,
      sortOrder INT NOT NULL DEFAULT 0
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Criteria')
    CREATE TABLE Criteria (
      id INT IDENTITY(1,1) PRIMARY KEY,
      categoryId INT NOT NULL FOREIGN KEY REFERENCES Categories(id),
      name NVARCHAR(256) NOT NULL,
      definition NVARCHAR(MAX),
      sortOrder INT NOT NULL DEFAULT 0
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReferenceAnswers')
    CREATE TABLE ReferenceAnswers (
      id INT IDENTITY(1,1) PRIMARY KEY,
      technologyId INT NOT NULL FOREIGN KEY REFERENCES Technologies(id),
      criteriaId INT NOT NULL FOREIGN KEY REFERENCES Criteria(id),
      score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
      justification NVARCHAR(MAX),
      updatedBy INT,
      updatedAt DATETIME2 DEFAULT GETUTCDATE(),
      UNIQUE(technologyId, criteriaId)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Comparisons')
    CREATE TABLE Comparisons (
      id INT IDENTITY(1,1) PRIMARY KEY,
      clientName NVARCHAR(256) NULL,
      useCaseDescription NVARCHAR(MAX),
      comparisonType NVARCHAR(20) NOT NULL DEFAULT 'client',
      createdBy INT NOT NULL,
      status NVARCHAR(20) DEFAULT 'draft',
      createdAt DATETIME2 DEFAULT GETUTCDATE(),
      updatedAt DATETIME2 DEFAULT GETUTCDATE()
    );
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns 
      WHERE Name = N'clientName' AND Object_ID = Object_ID(N'Comparisons') AND is_nullable = 0
    )
    BEGIN
      ALTER TABLE Comparisons ALTER COLUMN clientName NVARCHAR(256) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns 
      WHERE Name = N'comparisonType' AND Object_ID = Object_ID(N'Comparisons')
    )
    BEGIN
      ALTER TABLE Comparisons ADD comparisonType NVARCHAR(20) NOT NULL CONSTRAINT DF_Comparisons_comparisonType DEFAULT 'client';
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ComparisonTechnologies')
    CREATE TABLE ComparisonTechnologies (
      id INT IDENTITY(1,1) PRIMARY KEY,
      comparisonId INT NOT NULL FOREIGN KEY REFERENCES Comparisons(id) ON DELETE CASCADE,
      technologyId INT NOT NULL FOREIGN KEY REFERENCES Technologies(id),
      UNIQUE(comparisonId, technologyId)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CategoryWeights')
    CREATE TABLE CategoryWeights (
      id INT IDENTITY(1,1) PRIMARY KEY,
      comparisonId INT NOT NULL FOREIGN KEY REFERENCES Comparisons(id) ON DELETE CASCADE,
      categoryId INT NOT NULL FOREIGN KEY REFERENCES Categories(id),
      weight DECIMAL(5,2) NOT NULL DEFAULT 1.0,
      UNIQUE(comparisonId, categoryId)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DefaultCategoryWeights')
    CREATE TABLE DefaultCategoryWeights (
      id INT IDENTITY(1,1) PRIMARY KEY,
      categoryId INT NOT NULL UNIQUE FOREIGN KEY REFERENCES Categories(id),
      weight DECIMAL(5,2) NOT NULL DEFAULT 1.0
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ComparisonScores')
    CREATE TABLE ComparisonScores (
      id INT IDENTITY(1,1) PRIMARY KEY,
      comparisonId INT NOT NULL FOREIGN KEY REFERENCES Comparisons(id) ON DELETE CASCADE,
      technologyId INT NOT NULL FOREIGN KEY REFERENCES Technologies(id),
      criteriaId INT NOT NULL FOREIGN KEY REFERENCES Criteria(id),
      score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
      justification NVARCHAR(MAX),
      updatedBy INT,
      updatedAt DATETIME2 DEFAULT GETUTCDATE(),
      UNIQUE(comparisonId, technologyId, criteriaId)
    );
  `);

  const catCount = await pool.request().query('SELECT COUNT(*) as cnt FROM Categories');
  if (catCount.recordset[0].cnt === 0) {
    await seedCategoriesAndCriteria(pool);
  }

  await pool.request().query(`
    INSERT INTO DefaultCategoryWeights (categoryId, weight)
    SELECT c.id, 1.0
    FROM Categories c
    WHERE NOT EXISTS (
      SELECT 1 FROM DefaultCategoryWeights dcw WHERE dcw.categoryId = c.id
    );
  `);
}

async function seedCategoriesAndCriteria(pool: sql.ConnectionPool): Promise<void> {
  const seedData: { category: string; criteria: { name: string; definition: string }[] }[] = [
    {
      category: 'Business fit',
      criteria: [
        { name: 'Main use case coverage', definition: 'Fit for reporting, analytics, or AI needs' },
        { name: 'Time to value', definition: 'How fast the platform can deliver a useful result' },
        { name: 'Fit for target users', definition: 'Works for analysts, engineers, and business users' },
        { name: 'Adoption potential', definition: 'Likelihood of broad business adoption' },
        { name: 'Future extensibility', definition: 'Can support new use cases later' },
      ],
    },
    {
      category: 'Ingestion',
      criteria: [
        { name: 'Batch ingestion', definition: 'Standard scheduled loads from files and databases' },
        { name: 'Streaming ingestion', definition: 'Real-time or near-real-time support' },
        { name: 'API integration', definition: 'Ability to connect via APIs and services' },
        { name: 'Source connectivity', definition: 'Breadth and quality of connectors' },
        { name: 'Cloud integration', definition: 'Works with your current cloud ecosystem' },
      ],
    },
    {
      category: 'Processing',
      criteria: [
        { name: 'SQL support', definition: 'Depth of SQL capabilities' },
        { name: 'Notebook / code support', definition: 'Python, SQL, notebooks, or similar development options' },
        { name: 'ETL / ELT support', definition: 'Transformation and pipeline capability' },
        { name: 'Orchestration', definition: 'Scheduling, dependencies, pipeline control' },
        { name: 'Incremental processing', definition: 'Efficient delta and change-based processing' },
      ],
    },
    {
      category: 'Architecture',
      criteria: [
        { name: 'Storage model', definition: 'Data organization and persistence model' },
        { name: 'Compute model', definition: 'How compute is allocated and scaled' },
        { name: 'Separation of concerns', definition: 'Ability to isolate storage, compute, and workloads' },
        { name: 'Workload isolation', definition: 'Protection between teams and workloads' },
        { name: 'Scalability', definition: 'Performance under growing data and users' },
        { name: 'Concurrency', definition: 'Ability to serve many simultaneous users' },
      ],
    },
    {
      category: 'Governance',
      criteria: [
        { name: 'Cataloging', definition: 'Data discovery and catalog support' },
        { name: 'Lineage', definition: 'Traceability across data flows' },
        { name: 'Business glossary', definition: 'Shared definitions and data language' },
        { name: 'Ownership model', definition: 'Clear accountability for data assets' },
        { name: 'Metadata management', definition: 'Quality and completeness of metadata handling' },
        { name: 'Policy enforcement', definition: 'Ability to enforce standards and controls' },
        { name: 'Data classification', definition: 'Handling of sensitive and regulated data' },
      ],
    },
    {
      category: 'Security',
      criteria: [
        { name: 'Authentication', definition: 'SSO, IAM, identity integration' },
        { name: 'Authorization', definition: 'Role-based and fine-grained access control' },
        { name: 'Row / column security', definition: 'Granular data protection' },
        { name: 'Encryption', definition: 'Data protection in transit and at rest' },
        { name: 'Audit logging', definition: 'Traceability for access and change' },
        { name: 'Compliance support', definition: 'GDPR, SOC, ISO, and related controls' },
      ],
    },
    {
      category: 'Operations',
      criteria: [
        { name: 'Monitoring', definition: 'Visibility into jobs, workloads, and platform health' },
        { name: 'Alerting', definition: 'Notifications for failures and anomalies' },
        { name: 'Backup / recovery', definition: 'Recovery options and resilience' },
        { name: 'CI/CD support', definition: 'Deployment and promotion across environments' },
        { name: 'Environment management', definition: 'Dev / test / prod control' },
        { name: 'Vendor support', definition: 'Quality of vendor assistance and response' },
      ],
    },
    {
      category: 'Usability',
      criteria: [
        { name: 'Interface quality', definition: 'Overall ease of use' },
        { name: 'Learning curve', definition: 'Effort to train users and admins' },
        { name: 'Documentation quality', definition: 'Help content, examples, and guidance' },
        { name: 'Developer productivity', definition: 'Speed of building and maintaining solutions' },
      ],
    },
    {
      category: 'Cost',
      criteria: [
        { name: 'License cost', definition: 'Direct vendor pricing / subscription cost' },
        { name: 'Compute cost', definition: 'Runtime or consumption-based cost' },
        { name: 'Storage cost', definition: 'Data storage economics' },
        { name: 'Support cost', definition: 'Ongoing support and admin cost' },
        { name: 'Implementation cost', definition: 'Delivery, migration, and setup effort' },
        { name: 'Training cost', definition: 'Enablement and onboarding cost' },
      ],
    },
    {
      category: 'Future',
      criteria: [
        { name: 'Roadmap credibility', definition: 'Confidence in product direction' },
        { name: 'Ecosystem strength', definition: 'Community, partners, and integrations' },
        { name: 'Extensibility', definition: 'APIs, customization, add-ons' },
        { name: 'Vendor maturity', definition: 'Stability and enterprise readiness' },
      ],
    },
  ];

  for (let i = 0; i < seedData.length; i++) {
    const { category, criteria } = seedData[i];
    const catResult = await pool
      .request()
      .input('name', sql.NVarChar, category)
      .input('sortOrder', sql.Int, i)
      .query('INSERT INTO Categories (name, sortOrder) OUTPUT INSERTED.id VALUES (@name, @sortOrder)');
    const categoryId = catResult.recordset[0].id;

    for (let j = 0; j < criteria.length; j++) {
      const criterion = criteria[j];
      await pool
        .request()
        .input('categoryId', sql.Int, categoryId)
        .input('name', sql.NVarChar, criterion.name)
        .input('definition', sql.NVarChar, criterion.definition)
        .input('sortOrder', sql.Int, j)
        .query(
          'INSERT INTO Criteria (categoryId, name, definition, sortOrder) VALUES (@categoryId, @name, @definition, @sortOrder)'
        );
    }
  }
}
