import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import { comparisonsApi, criteriaApi, technologiesApi } from '../services/api';

interface Technology {
  id: number;
  name: string;
  description: string;
}

interface Category {
  id: number;
  name: string;
  criteria: { id: number; name: string; definition: string }[];
}

interface DefaultWeight {
  categoryId: number;
  weight: number;
}

export default function NewComparisonPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const comparisonType = searchParams.get('type') === 'simple' ? 'simple' : 'client';
  const isSimple = comparisonType === 'simple';
  const [clientName, setClientName] = useState('');
  const [useCaseDescription, setUseCaseDescription] = useState('');
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<number[]>([]);
  const [categoryWeights, setCategoryWeights] = useState<Record<number, number>>({});
  const [newTechName, setNewTechName] = useState('');
  const [newTechDesc, setNewTechDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(isSimple ? 2 : 1);
  const [modal, setModal] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    variant: 'confirm' | 'info';
  } | null>(null);

  useEffect(() => {
    setStep(isSimple ? 2 : 1);
  }, [isSimple]);

  useEffect(() => {
    Promise.all([technologiesApi.list(), criteriaApi.list(), criteriaApi.getDefaultWeights()]).then(
      ([techs, cats, defaultWeights]: [Technology[], Category[], DefaultWeight[]]) => {
        setTechnologies(techs);
        setCategories(cats);

        const defaultWeightMap = new Map(defaultWeights.map((item) => [item.categoryId, item.weight]));
        const weights: Record<number, number> = {};
        cats.forEach((category) => {
          weights[category.id] = defaultWeightMap.get(category.id) ?? 1;
        });
        setCategoryWeights(weights);
      }
    );
  }, []);

  const selectedTechObjects = useMemo(
    () => technologies.filter((technology) => selectedTechs.includes(technology.id)),
    [technologies, selectedTechs]
  );

  const toggleTech = (id: number) => {
    setSelectedTechs((prev) => (prev.includes(id) ? prev.filter((techId) => techId !== id) : [...prev, id]));
  };

  const addNewTech = async () => {
    if (!newTechName.trim()) return;
    const result = await technologiesApi.create({
      name: newTechName.trim(),
      description: newTechDesc.trim() || undefined,
    });

    if (!result.alreadyExists) {
      setTechnologies((prev) => [...prev, result]);
    }

    setSelectedTechs((prev) => (prev.includes(result.id) ? prev : [...prev, result.id]));
    setNewTechName('');
    setNewTechDesc('');
  };

  const handleCreate = async () => {
    if ((!isSimple && !clientName.trim()) || selectedTechs.length < 2) return;

    setSaving(true);
    try {
      const weights = Object.entries(categoryWeights).map(([categoryId, weight]) => ({
        categoryId: parseInt(categoryId, 10),
        weight,
      }));

      const comparison = await comparisonsApi.create({
        clientName: isSimple ? null : clientName.trim(),
        comparisonType,
        useCaseDescription: useCaseDescription.trim(),
        technologyIds: selectedTechs,
        categoryWeights: weights,
      });

      navigate(`/comparison/${comparison.id}`);
    } catch {
      setModal({ title: 'Create comparison failed', message: 'Failed to create comparison.', variant: 'info' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container page-stack">
      <section className="page-header-block">
        <div>
          <span className="eyebrow">New comparison</span>
          <h1 className="page-title">{isSimple ? 'Simple technology comparison' : 'Client technology comparison'}</h1>
          <p className="page-subtitle">
            {isSimple
              ? 'Skip account context and jump directly into selecting technologies and category emphasis.'
              : 'Capture client context, select the technologies, and tune the scoring weights before you begin.'}
          </p>
        </div>
      </section>

      <div className="tabs">
        {!isSimple && (
          <button className={`tab ${step === 1 ? 'active' : ''}`} onClick={() => setStep(1)}>
            Client context
          </button>
        )}
        <button className={`tab ${step === 2 ? 'active' : ''}`} onClick={() => (!isSimple ? step >= 2 : true) && setStep(2)}>
          Technologies
        </button>
        <button className={`tab ${step === 3 ? 'active' : ''}`} onClick={() => step >= 3 && setStep(3)}>
          Category weights
        </button>
      </div>

      {!isSimple && step === 1 && (
        <section className="card form-card">
          <h3>Client information</h3>
          <div className="form-group">
            <label>Client name *</label>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="e.g. Contoso Retail" />
          </div>
          <div className="form-group">
            <label>Use case description</label>
            <textarea
              value={useCaseDescription}
              onChange={(event) => setUseCaseDescription(event.target.value)}
              placeholder="Describe goals, constraints, user groups, and delivery expectations."
            />
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!clientName.trim()}>
              Continue to technologies
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card form-card">
          <div className="section-heading-row">
            <div>
              <h3>Select technologies</h3>
              <p className="muted">Pick at least two technologies. Add a new one if you do not see it listed.</p>
            </div>
            <span className="pill pill-outline">{selectedTechs.length} selected</span>
          </div>

          <div className="option-grid">
            {technologies.map((technology) => {
              const selected = selectedTechs.includes(technology.id);
              return (
                <button
                  key={technology.id}
                  type="button"
                  className={`option-card ${selected ? 'selected' : ''}`}
                  onClick={() => toggleTech(technology.id)}
                  title={technology.description}
                >
                  <span className="option-title">{technology.name}</span>
                  <span className="option-description">{technology.description || 'No description provided yet.'}</span>
                  <span className="pill pill-outline">{selected ? 'Selected' : 'Add'}</span>
                </button>
              );
            })}
          </div>

          {selectedTechObjects.length > 0 && (
            <div>
              <div className="label">Current selection</div>
              <div className="tag-row">
                {selectedTechObjects.map((technology) => (
                  <span className="tag selected" key={technology.id}>
                    {technology.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="subtle-panel">
            <h4>Add new technology</h4>
            <div className="inline-form responsive-inline">
              <input placeholder="Technology name" value={newTechName} onChange={(event) => setNewTechName(event.target.value)} />
              <input placeholder="Short description" value={newTechDesc} onChange={(event) => setNewTechDesc(event.target.value)} />
              <button className="btn btn-secondary" onClick={addNewTech}>
                Add technology
              </button>
            </div>
          </div>

          <div className="hero-actions">
            {!isSimple && (
              <button className="btn btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setStep(3)} disabled={selectedTechs.length < 2}>
              Continue to weights
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card form-card">
          <div className="section-heading-row">
            <div>
              <h3>Category weights</h3>
              <p className="muted">Weights start from the admin-defined defaults and can be adjusted for this comparison.</p>
            </div>
          </div>

          <div className="weight-grid">
            {categories.map((category) => (
              <div className="weight-card" key={category.id}>
                <div>
                  <strong>{category.name}</strong>
                  <p className="muted">{category.criteria.length} criteria</p>
                </div>
                <input
                  type="number"
                  className="weight-input"
                  min="0"
                  max="10"
                  step="0.5"
                  value={categoryWeights[category.id] ?? 1}
                  onChange={(event) =>
                    setCategoryWeights((prev) => ({
                      ...prev,
                      [category.id]: parseFloat(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="hero-actions">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create comparison'}
            </button>
          </div>
        </section>
      )}
      <Modal
        open={!!modal}
        title={modal?.title ?? ''}
        message={modal?.message}
        variant={modal?.variant ?? 'info'}
        onConfirm={modal?.onConfirm ?? (() => setModal(null))}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
